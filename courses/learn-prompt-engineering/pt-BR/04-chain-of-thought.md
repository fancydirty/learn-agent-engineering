# Lição 4: Chain-of-Thought: fazendo a IA mostrar seu raciocínio

> Objetivos de aprendizado:
> - Entender como o chain-of-thought funciona e por que ele ajuda
> - Aprender a guiar o raciocínio da IA com “vamos pensar passo a passo”
> - Reconhecer quais tipos de tarefa combinam com CoT
>
> Pré-requisitos: [<< Lição 3: Few-shot learning](./03-few-shot-learning.md) | Próxima: [Lição 5 >>](./05-debugging-prompts.md)

## Quando a IA dá a resposta certa pelo raciocínio errado

Você passa um problema de matemática para a IA e ela responde “42”. Você confere, e a resposta está certa. Mas troque por um problema parecido e a resposta sai errada. O que aconteceu? O modelo pode ter chutado, ou pode ter seguido um caminho de raciocínio quebrado que por acaso caiu no número certo.

Para tarefas que exigem raciocínio de várias etapas (problemas de matemática, quebra-cabeças lógicos, análises complexas), fazer a IA mostrar as etapas do raciocínio é mais confiável do que pedir a resposta direto[^S5][^S10]. Essa é a ideia central do chain-of-thought (CoT) prompting: quebrar a conclusão em etapas intermediárias que você consegue de fato conferir.

## O que é chain-of-thought

**Chain-of-thought (CoT) prompting** é uma técnica que faz o modelo expor as etapas intermediárias de raciocínio antes de dar a resposta final[^S5]. Nas palavras da pesquisa, o chain-of-thought prompting "enables complex reasoning capabilities through intermediate reasoning steps" (habilita capacidades de raciocínio complexo por meio de etapas intermediárias de raciocínio)[^S5]. A intuição é simples: "Chain of Thought prompting encourages the model to think through the problem in a step-by-step manner, which is supposed to mimic how humans break down complex problems" (o chain of thought prompting incentiva o modelo a pensar o problema passo a passo, imitando o jeito como as pessoas decompõem problemas complexos)[^S10]. É a mesma coisa que você faz quando anota as equações e os resultados intermediários num rascunho para resolver uma conta.

Compare as duas abordagens:

### Respondendo direto (sujeito a erro)

❌ **Sem CoT**:
```
Problema: uma cafeteria vendeu 23 xícaras de café pela manhã, 17 ao meio-dia e o dobro da manhã à tarde. Quantas xícaras vendeu no dia inteiro?

Resposta:
```

A IA pode simplesmente devolver:
```
86 xícaras
```

Se a resposta estiver errada, você não tem como saber qual etapa saiu do trilho.

### Mostrando as etapas do raciocínio (mais confiável)

✅ **Com CoT**:
```
Problema: uma cafeteria vendeu 23 xícaras de café pela manhã, 17 ao meio-dia e o dobro da manhã à tarde. Quantas xícaras vendeu no dia inteiro?

Vamos pensar passo a passo:
```

A IA devolve:
```
Vamos pensar passo a passo:

1. Vendas da manhã: 23 xícaras
2. Vendas do meio-dia: 17 xícaras
3. À tarde é o dobro da manhã: 23 × 2 = 46 xícaras
4. Total do dia: 23 + 17 + 46 = 86 xícaras

Resposta: 86 xícaras
```

Cada etapa fica visível, então, se uma delas estiver errada, você percebe na hora e corrige o prompt.

Pesquisas mostram que, em tarefas que envolvem raciocínio de várias etapas, o CoT eleva bastante a acurácia[^S5]; em algumas tarefas, combinar CoT com demonstrações resolvidas aumenta a acurácia em até 28,2% adicionais[^S10].

## Duas formas de usar o CoT

### Método 1: CoT zero-shot (o mais simples)

Acrescente uma linha ao final do seu prompt: “**vamos pensar passo a passo**” (let's think step by step)[^S5][^S10].

```
Problema: se 5 trabalhadores precisam de 5 dias para terminar um projeto, de quantos dias 10 trabalhadores precisam?

Vamos pensar passo a passo:
```

Essa única linha aciona o modo de raciocínio passo a passo do modelo. Você não fornece nenhum exemplo; o modelo decompõe o problema sozinho.

### Método 2: CoT few-shot (mais controlável)

Dê um ou dois exemplos que incluam o processo de raciocínio completo[^S5][^S10].

```
Exemplo:
Problema: um carro anda a 60 km/h. Que distância ele percorre em 3 horas?
Raciocínio:
- Velocidade = 60 km/h
- Tempo = 3 horas
- Distância = velocidade × tempo = 60 × 3 = 180 km
Resposta: 180 km

Agora resolva este problema:
Problema: um carro anda a 80 km/h por 2,5 horas e depois a 60 km/h por mais 1 hora. Que distância ele percorre no total?
Raciocínio:
```

O exemplo mostra o formato do raciocínio e o nível de detalhe esperado das etapas, e o modelo imita esse estilo.

## Que tarefas combinam com CoT

O CoT funciona melhor em tarefas que exigem raciocínio de várias etapas[^S10]:

✅ **Raciocínio matemático e lógico**
- Problemas de enunciado
- Cálculos de razão e proporção
- Deduções de fórmulas em várias etapas

✅ **Análise de causas**
- “Por que X causa Y?”
- “Qual é a causa raiz desse bug?”

✅ **Planejamento e decisões**
- “Devo fazer A ou B primeiro?”
- “Quais são os prós e contras dessa abordagem?”

✅ **Depuração de código**
- “Por que esse código falha?”
- “Qual etapa é o gargalo de desempenho?”

Onde ele não se encaixa:

❌ **Consultas factuais simples**: “Quando o Python foi lançado?” — não exige raciocínio
❌ **Escrita criativa**: poemas, histórias — as etapas de raciocínio quebram o fluxo criativo
❌ **Conversão de formato**: JSON → CSV — é uma operação mecânica, não exige raciocínio

Regra prática: se você pegaria papel e caneta para listar as etapas ao fazer a tarefa por conta própria, ela combina com CoT.

```agentmentor-check
{
  "id": "prompt-engineering-cot-task-fit",
  "label": "Adequação de CoT",
  "prompt": "Qual destas tarefas é a que mais combina com chain-of-thought prompting?\n\nA: Traduzir este texto em inglês para o português\nB: Analisar a complexidade de tempo deste código e explicar por quê\nC: Gerar 10 nomes criativos de produto\nD: Reescrever este texto em um tom formal",
  "whyHere": "Verifica se você percebe que o CoT combina com tarefas de raciocínio de várias etapas, e não com conversões simples ou geração criativa — exatamente a armadilha que leva as pessoas a acoplar CoT em tudo",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "A - Tarefa de tradução",
      "correct": false,
      "feedback": "❌ Tradução é uma conversão de linguagem, não uma tarefa de raciocínio. O modelo até processa o texto internamente, mas explicitar etapas como “primeiro traduza o sujeito, depois o verbo” pouco acrescenta à qualidade da tradução."
    },
    {
      "id": "b",
      "text": "B - Analisar a complexidade de tempo",
      "correct": true,
      "feedback": "✓ Correto. A análise de complexidade de tempo exige várias etapas de raciocínio: identificar a estrutura dos laços, contar as iterações de cada um, verificar se há aninhamento, chegar a O(n) ou O(n²). Mostrar essas etapas mantém a lógica honesta e permite conferir onde um julgamento saiu errado."
    },
    {
      "id": "c",
      "text": "C - Gerar nomes criativos",
      "correct": false,
      "feedback": "❌ Geração criativa não precisa de etapas de raciocínio visíveis. Forçar CoT (“etapa um: escolher uma palavra-raiz; etapa dois: acrescentar um prefixo...”) estreita as ideias e deixa a saída mecânica."
    },
    {
      "id": "d",
      "text": "D - Reescrever em tom formal",
      "correct": false,
      "feedback": "❌ Reescrever o tom é uma conversão de estilo, não raciocínio. Você até poderia listar etapas (“tirar as gírias, trocar por construções da escrita formal”), mas elas ajudam pouco no resultado; reescrever direto funciona melhor."
    }
  ]
}
```

## Exemplos resolvidos: analisando problemas com CoT

### Cenário 1: análise de desempenho de código

**Sem CoT (uma conclusão em que você não pode confiar)**:
````
Este código tem algum problema de desempenho?

```python
def find_duplicates(items):
    duplicates = []
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            if items[i] == items[j] and items[i] not in duplicates:
                duplicates.append(items[i])
    return duplicates
```

Resposta: sim, tem um problema de desempenho
````

Só a conclusão, sem nenhuma justificativa.

**Com CoT (raciocínio explícito)**:
````
Analise o problema de desempenho deste código. Explique passo a passo:
1. Identifique a estrutura dos laços
2. Calcule a complexidade de tempo
3. Aponte o gargalo específico
4. Sugira uma otimização

```python
def find_duplicates(items):
    duplicates = []
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            if items[i] == items[j] and items[i] not in duplicates:
                duplicates.append(items[i])
    return duplicates
```
````

A IA mostra:
```
Análise de desempenho:

1. Estrutura dos laços:
   - Laço externo: percorre cada elemento, O(n)
   - Laço interno: para cada elemento, percorre os restantes, O(n)
   - No geral: laços aninhados, O(n²)

2. Complexidade de tempo:
   - Laços principais: O(n²)
   - A verificação `items[i] not in duplicates`: O(m) no pior caso, onde m é a quantidade de duplicatas encontradas até então
   - Complexidade total: O(n² × m)

3. Gargalo de desempenho:
   - Os laços aninhados ficam muito lentos com entradas grandes (n > 1000)
   - A varredura linear do `not in` sobre uma lista deixa tudo mais lento ainda

4. Otimização:
   - Usar um set em vez de uma lista para guardar as duplicatas, baixando a verificação de O(m) para O(1)
   - Ou usar um Counter para encontrar, em uma única passagem, todos os elementos que aparecem mais de uma vez, baixando para O(n)
```

Cada etapa do raciocínio é conferível, então, se uma delas estiver errada, você enxerga na hora.

### Cenário 2: um quebra-cabeça lógico

**Problema**:
```
Três pessoas — A, B e C — entram em uma competição. Sabemos que:
- A não é a primeira colocada
- B não é a última colocada
- C não é nem a primeira nem a última colocada

Qual é a classificação de cada uma?

Vamos raciocinar passo a passo:
```

**Saída da IA**:
```
Vamos raciocinar passo a passo:

1. Comece pela condição de C:
   - C não é a primeira nem a última
   - Logo, C só pode ser a segunda

2. Determine A e B:
   - A não é a primeira
   - B não é a última
   - C já é a segunda, sobrando a primeira e a terceira posições para A e B

3. Atribua as posições restantes:
   - A não é a primeira, logo A é a terceira
   - B não é a última (terceira), logo B é a primeira

Resposta: B em primeiro, C em segundo, A em terceiro
```

Expor essa eliminação passo a passo torna bem mais fácil conferir se a lógica está fechada.

## Padrões comuns de CoT

### Padrão 1: decomposição do problema

Quebre um problema complexo em alguns subproblemas.

```
Problema: um projeto de software tem 5 engenheiros, cada um trabalhando 6 horas por dia, e exige 120 pessoa-dias de trabalho. Se a equipe crescer para 8 engenheiros, quantos dias antes ele termina?

Vamos calcular passo a passo:
1. De quantos dias a configuração atual precisa?
2. De quantos dias precisa depois de acrescentar pessoas?
3. Quantos dias antes?
```

### Padrão 2: teste de hipóteses

Liste as hipóteses e depois verifique uma a uma.

```
Este código lança "TypeError: unsupported operand type(s)". Quais são as causas possíveis?

Vamos verificar as causas possíveis uma a uma:
1. Verifique os tipos das variáveis de cada lado do operador
2. Verifique se algum valor None está envolvido na operação
3. Verifique se uma string e um número estão sendo misturados
```

### Padrão 3: argumentar os dois lados

Liste os argumentos a favor e contra e depois chegue a uma conclusão.

```
Devemos usar uma arquitetura de microsserviços ou um monolito?

Vamos analisar por dois ângulos:

Argumentos a favor de microsserviços:
1. ...
2. ...

Argumentos a favor de um monolito:
1. ...
2. ...

Julgamento geral:
Considerando o tamanho atual da equipe e a complexidade do projeto, eu recomendo...
```

## Os limites do CoT

O CoT não é uma solução universal. Ele tem alguns limites:

**1. Ele aumenta o tamanho e o tempo**

Mostrar as etapas do raciocínio deixa a saída mais longa, consome mais tokens e demora mais para responder.

**Quando vale a pena**: em tarefas complexas, gastar 2-3x mais tokens para ganhar acurácia é uma boa troca.
**Quando não vale**: em tarefas simples (“que dia é hoje”), as etapas de raciocínio são desperdício puro.

**2. As próprias etapas do raciocínio podem estar erradas**

As etapas que a IA mostra podem parecer razoáveis e ainda assim ter um furo na lógica. Você continua precisando conferir se o raciocínio está correto.

O valor do CoT é tornar os erros visíveis. Quando a IA responde direto, o erro fica escondido numa caixa-preta; quando as etapas aparecem, o erro se manifesta em alguma delas e fica mais fácil de encontrar e corrigir.

**3. Ele não combina com tarefas que dependem de intuição**

Algumas tarefas (escrita criativa, avaliação de arte) se apoiam numa impressão geral, e forçá-las a virar etapas quebra o conjunto.

## Recapitulação

O chain-of-thought prompting faz a IA mostrar as etapas do seu raciocínio em vez de pular direto para uma resposta. Acrescentando “vamos pensar passo a passo” ao prompt, ou fornecendo exemplos que incluem o raciocínio, você aumenta bastante a acurácia em tarefas de raciocínio de várias etapas.

O CoT combina com raciocínio matemático, análise lógica, inferência de causas, decisões complexas — qualquer coisa que exija várias etapas de pensamento. Ele torna o raciocínio visível e conferível. Ele de fato aumenta o tamanho da saída, mas, em tarefas complexas, o retorno supera de longe o custo.

A próxima lição trata de como depurar e melhorar prompts: quando a saída da IA não corresponde ao que você esperava, como encontrar o problema de forma sistemática e corrigi-lo.

**Próxima lição** [Depuração e melhoria de prompts >>](./05-debugging-prompts.md)

<!-- exercises -->

## 💻 Exercícios

### Nível 1: Aplicar o CoT zero-shot

Use a técnica do “vamos pensar passo a passo” para fazer a IA resolver o problema abaixo:

**Problema**: uma equipe tem 8 pessoas, cada uma trabalhando 6 horas por dia. O projeto exige 240 pessoa-horas de trabalho. Se a equipe crescer para 12 pessoas, quantos dias antes ele termina?

Escreva o prompt completo (incluindo o “vamos pensar passo a passo”) e depois preveja quais etapas intermediárias a IA vai mostrar.

<!-- rubric -->
- Prompt inclui “vamos pensar passo a passo” ou uma deixa equivalente
- Enunciado do problema claro e completo
- Etapas de raciocínio previstas logicamente corretas
- Etapas cobrem os cálculos-chave (dias necessários na configuração atual, dias necessários na nova configuração, a diferença)
- Identificação do motivo pelo qual esse problema combina com CoT
<!-- answer -->
**Prompt**:
```
Uma equipe tem 8 pessoas, cada uma trabalhando 6 horas por dia. O projeto exige 240 pessoa-horas de trabalho. Se a equipe crescer para 12 pessoas, quantos dias antes ele termina?

Vamos pensar passo a passo:
```

**Etapas de raciocínio previstas**:
```
Vamos pensar passo a passo:

1. Calcular a produção diária da equipe atual:
   - 8 pessoas × 6 horas/pessoa/dia = 48 pessoa-horas/dia

2. Calcular os dias necessários na configuração atual:
   - 240 pessoa-horas ÷ 48 pessoa-horas/dia = 5 dias

3. Calcular a produção diária da equipe ampliada:
   - 12 pessoas × 6 horas/pessoa/dia = 72 pessoa-horas/dia

4. Calcular os dias necessários na nova configuração:
   - 240 pessoa-horas ÷ 72 pessoa-horas/dia = 3,33 dias (cerca de 3,4 dias)

5. Calcular os dias economizados:
   - 5 dias − 3,33 dias = 1,67 dia (cerca de 1,7 dia, ou 1 dia e 17 horas)

Resposta: o projeto termina cerca de 1,7 dia antes.
```

**Por que combina com CoT**:
- É um cálculo de várias etapas em que cada uma alimenta a seguinte
- Responder direto facilita errar a conta ou pular uma etapa
- Mostrar as etapas permite conferir cada cálculo
- Se a resposta sair torta, dá para localizar rapidamente qual etapa saiu errada

<!-- hint -->
A chave nesse tipo de problema: calcule primeiro o estado atual, depois o estado após a mudança, depois a diferença. Ao prever as etapas de raciocínio, liste cada cálculo nessa ordem.
<!-- hint -->
CoT zero-shot é só acrescentar uma linha, “vamos pensar passo a passo” — sem exemplos. Experimente usar essa técnica para fazer a IA explicar o raciocínio dela.

### Nível 2: Projetar um prompt de CoT few-shot

Cenário: você precisa que a IA julgue a complexidade de tempo de um trecho de código e explique o raciocínio.

Projete um prompt de CoT few-shot com 2 exemplos (um O(n), outro O(n²)) que mostre as etapas completas do raciocínio.

<!-- rubric -->
- Ambos os trechos de código de exemplo com estrutura clara e julgamento de complexidade correto
- Etapas de raciocínio completas em cada exemplo: identificar laços → calcular a complexidade de cada nível → combinar na complexidade total
- Formato consistente entre as etapas de raciocínio
- Exemplos cobrindo tipos diferentes (laço único vs. laço aninhado)
- Prompt declarando a tarefa e o formato de saída
<!-- answer -->
**Prompt de CoT few-shot**:

````
Analise a complexidade de tempo do código e mostre as etapas do raciocínio.

Exemplo 1:
Código:
```python
def find_max(arr):
    max_val = arr[0]
    for num in arr:
        if num > max_val:
            max_val = num
    return max_val
```

Raciocínio:
1. Identificar a estrutura dos laços: um laço for sobre o array
2. Contagem de iterações: visita n elementos, cada um acessado uma vez
3. Operações do corpo do laço: comparação e atribuição, ambas O(1), tempo constante
4. Complexidade total: O(n) × O(1) = O(n)

Conclusão: a complexidade de tempo é O(n)

---

Exemplo 2:
Código:
```python
def find_duplicates(arr):
    duplicates = []
    for i in range(len(arr)):
        for j in range(i + 1, len(arr)):
            if arr[i] == arr[j]:
                duplicates.append(arr[i])
    return duplicates
```

Raciocínio:
1. Identificar a estrutura dos laços: dois laços for aninhados
2. Laço externo: percorre n elementos
3. Laço interno: para cada i, percorre (n-i-1) elementos
4. Contagem total de iterações: (n-1) + (n-2) + ... + 1 = n(n-1)/2 ≈ n²/2
5. Operações do corpo do laço: comparação e append, ambas O(1)
6. Complexidade total: O(n²) × O(1) = O(n²)

Conclusão: a complexidade de tempo é O(n²)

---

Agora analise este código:
Código:
```python
[cole o código]
```

Raciocínio:
````

**Por que esse prompt funciona**:
1. **Contraste claro entre os exemplos**: a diferença entre O(n) e O(n²) está no aninhamento dos laços
2. **Etapas de raciocínio padronizadas**: identificar a estrutura → contar iterações → analisar operações → chegar a uma conclusão
3. **Formato consistente**: os dois exemplos usam o mesmo formato de etapas numeradas
4. **Cada etapa explicada o suficiente**: não é só “isto é O(n)”, mas por que é O(n)
5. **Final aberto**: “Raciocínio:” sinaliza para a IA produzir o processo de raciocínio

<!-- hint -->
A chave do CoT few-shot: os exemplos não devem apenas dar a resposta, devem mostrar cada etapa do pensamento que vai do problema até ela. Imagine ensinar uma pessoa a fazer essa tarefa — como você a decomporia para ela?
<!-- hint -->
Ao projetar as etapas de raciocínio, garanta que cada uma seja necessária (pular deixa o entendimento incompleto) e verificável (dá para conferir aquela etapa isoladamente).

<!-- /exercises -->
