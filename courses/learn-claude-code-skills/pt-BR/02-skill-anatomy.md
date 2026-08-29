# Lição 2: Anatomia de uma Skill: o arquivo SKILL.md

> Objetivos de aprendizado:
> - Entender a estrutura em duas partes do SKILL.md
> - Conhecer os campos obrigatórios do YAML frontmatter
> - Aprender a escrever uma description que realmente funciona
> - Ver como organizar a seção de instruções
>
> Pré-requisitos: [<< Lição 1](./01-what-are-skills.md) | Próxima: [Lição 3 >>](./03-first-skill.md)

## Como é um arquivo de Skill

Abra qualquer Skill e você encontrará o mesmo formato:[^S1]

```markdown
---
name: task-organizer
description: Organiza uma lista de tarefas bagunçada em grupos por prioridade e prazo
---

# Organizador de tarefas

Extraia informação estruturada de uma lista de tarefas desorganizada.

## Formato de entrada

Aceite qualquer um destes:
- Uma lista em texto simples
- Uma checklist em Markdown
- Um log de conversa com carimbos de hora

## Passos

1. Extraia o conteúdo central de cada tarefa
2. Identifique o prazo, se houver
3. Julgue a prioridade (urgente / importante / normal)
4. Ordene por prazo, do mais próximo ao mais distante

## Formato de saída

### 🔴 Urgente (vence hoje ou amanhã)
- [tarefa] - horário de vencimento

### 🟡 Importante (vence esta semana)
- [tarefa] - horário de vencimento

### ⚪ Normal (sem prazo claro, ou mais distante)
- [tarefa]
```

**Este arquivo tem duas partes:**

1. **YAML frontmatter** (tudo entre os marcadores `---`): metadados que informam ao Claude o básico sobre esta Skill
2. **Instruções em Markdown** (tudo o que vem depois): as orientações concretas que dizem ao Claude o que fazer

## YAML frontmatter: como o Claude encontra sua Skill

O frontmatter é o bloco no topo do arquivo delimitado por `---`. Ele informa ao Claude as duas coisas que mais importam:[^S3][^S4]

### name: o identificador único da Skill

```yaml
name: task-organizer
```

- **Regras**: letras minúsculas, dígitos e hifens. Sem espaços.
- **O que ele faz**: o nome vira o comando, como `/task-organizer`
- **Recomendação**: escolha algo descritivo, curto e óbvio à primeira vista

**Bons nomes:**
- `meeting-notes`
- `code-review`
- `changelog-generator`

**Nomes ruins:**
- `my-skill-1` (não diz nada)
- `super_amazing_task_helper` (longo demais, e underscores não são permitidos)
- `taskOrganizer` (camelCase — precisa ser minúsculas com hifens)

### description: o campo que mais importa

```yaml
description: Organiza uma lista de tarefas bagunçada em grupos por prioridade e prazo
```

**Esta única frase determina três coisas:**[^S6]

1. **Quando o Claude carrega esta Skill por conta própria**
2. **O que os usuários veem na lista de Skills**
3. **Para que o Claude entende que esta Skill serve**

É por isso que ela merece mais cuidado do que qualquer outra coisa no arquivo:[^S6]

> "The description is the single most important field in your frontmatter. A bad description means your skill either never triggers or triggers on everything. The formula: What it does + When to use it + Key capabilities."

**Uma boa description:**
```yaml
description: Organiza uma lista de tarefas bagunçada em grupos por prioridade e prazo. Use em listas de tarefas sem estrutura ou em itens de ação de reuniões
```

**Descriptions ruins:**
```yaml
description: Ajuda com tarefas  # Vaga demais — o Claude não faz ideia de quando recorrer a ela
description: Um poderoso gerenciador de tarefas com análise inteligente de prioridades  # Texto de marketing; os detalhes úteis vêm por último, se é que vêm
```

### Campos opcionais (tratados na Lição 6, não aqui)

- `model`: escolhe qual modelo usar
- `allowed-tools`: restringe quais ferramentas esta Skill pode acessar
- `version`: um número de versão

**Para sua primeira Skill, `name` e `description` são tudo de que você precisa.**[^S4]

## Instruções em Markdown: dizendo ao Claude como fazer

Tudo o que vem depois do frontmatter é escrito para o Claude ler e seguir.[^S1]

**Boas instruções compartilham três características:**

### 1. Seções claras

Use títulos para separar as partes:

```markdown
## Formato de entrada
(que tipos de entrada aceitar)

## Passos
(detalhe o procedimento, um passo por vez)

## Formato de saída
(com o que o resultado deve parecer)

## Casos de borda
(como lidar com as situações complicadas)
```

### 2. Passos concretos

**Fraco:**
```markdown
1. Analise as tarefas
2. Determine a prioridade
3. Produza o resultado
```

**Forte:**
```markdown
1. Leia a lista de tarefas, uma tarefa por linha
2. Extraia palavras-chave de data do texto da tarefa (hoje, amanhã, sexta-feira, 2024-01-15 e assim por diante)
3. Se uma tarefa contiver "urgente", "ASAP" ou "até o fim do dia", marque como prioridade alta
4. Ordene por prazo, do mais próximo ao mais distante
5. Produza três grupos: Urgente, Importante, Normal
```

### 3. Exemplos

Se o formato de saída importa, mostre um:

```markdown
## Formato de saída

### 🔴 Urgente
- Finalizar o relatório trimestral - amanhã 17:00
- Corrigir o bug em produção - hoje

### 🟡 Importante
- Revisar o PR #234 - nesta sexta

### ⚪ Normal
- Atualizar a documentação
- Melhorar o desempenho
```

Assim que o Claude tem um exemplo, ele sabe exatamente como organizar as coisas. Mostrar vence descrever — uma saída de exemplo trabalha mais do que três parágrafos sobre formatação.

```agentmentor-check
{
  "id": "skills-zh-02-description-quality",
  "label": "Identificação da description que funciona",
  "prompt": "Você escreveu uma Skill que transforma o histórico de commits do Git em um changelog que os clientes conseguem ler. Qual description é melhor?",
  "whyHere": "Você acabou de aprender a fórmula da description (o que ela faz + quando usar + principais capacidades). Descriptions vagas parecem aceitáveis para um leitor humano, então o teste é saber se você consegue distinguir uma da outra antes de publicar.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "description: Uma ferramenta de changelog poderosa e inteligente que deixa as releases do seu projeto com aparência profissional e fáceis de ler para qualquer pessoa",
      "correct": false,
      "feedback": "Não exatamente. Esta parece uma página de produto, não uma instrução. “Poderosa” e “inteligente” não significam nada para o Claude, e nenhum dos fatos que a acionariam está presente — sem commits do Git, sem saída voltada ao cliente, sem filtragem. Ela vai ficar sem uso ou disparar em qualquer pedido que mencione um projeto."
    },
    {
      "id": "b",
      "text": "description: Transforma o histórico de commits do Git em um changelog voltado ao cliente, filtrando commits internos e reescrevendo o jargão em linguagem simples",
      "correct": true,
      "feedback": "Correto. Ela diz o que faz (produz um changelog), o que recebe (commits do Git) e as principais capacidades (filtrar, reescrever o jargão). Palavras como “changelog” e “voltado ao cliente” dão ao Claude algo concreto para comparar com um pedido."
    }
  ]
}
```

## Como as duas partes trabalham juntas

**O frontmatter é o mecanismo de descoberta; as instruções são o guia de execução.**[^S2][^S5]

1. Você digita `/task-organizer`, ou simplesmente diz “me ajude a organizar estas tarefas”
2. O Claude lê o `name` e a `description` no frontmatter e decide se carrega esta Skill
3. Se carregar, o Claude lê as instruções completas
4. O Claude percorre os passos como foram escritos
5. A saída segue o formato que as instruções especificaram

**É por isso que a description precisa ser boa**: ela é a única evidência que o Claude tem ao decidir se vai usar esta Skill.[^S6]

Escreva “ajuda com tarefas” e o Claude não faz ideia de quais situações pedem por ela. Escreva “organiza uma lista de tarefas bagunçada em grupos por prioridade e prazo” e as palavras “organizar”, “lista de tarefas” e “tarefas” em um pedido já bastam para trazê-la.

## Um exemplo real: desmontando uma Skill de revisão de código

Aqui está uma Skill que é usada de verdade:

```markdown
---
name: code-review
description: Revisa mudanças de código em busca de violações das convenções do time, prováveis bugs e problemas de desempenho
---

# Assistente de revisão de código

## Checklist de revisão

Percorra cada item abaixo:

### 1. Convenções
- Os nomes de variáveis seguem a convenção do time (camelCase, nomes significativos)?
- Existem funções com mais de 50 linhas (considere dividir)?
- Existe código duplicado (DRY)?

### 2. Prováveis bugs
- Existem erros não tratados (try-catch, valores de retorno de erro)?
- Alguma possível desreferência de null?
- Algum risco de injeção de SQL (se houver banco de dados envolvido)?

### 3. Desempenho
- Alguma consulta N+1?
- Algum laço aninhado desnecessário?
- Algum cálculo repetido que poderia ser colocado em cache?

## Formato de saída

Para cada problema, informe:
- **Local**: nome do arquivo + número da linha
- **Problema**: o que especificamente está errado
- **Sugestão**: como corrigir

Se nada estiver errado, retorne "✓ Revisão de código aprovada"
```

**Destrinchando:**

- **A description no frontmatter**: diz o que ela faz (revisa código) e o que ela verifica (convenções, bugs, desempenho)
- **As instruções divididas em três checklists**: convenções, bugs, desempenho, cada uma com itens específicos a observar
- **O formato de saída é explícito**: todo problema precisa trazer um local, um problema e uma sugestão

Uma Skill escrita assim acerta na primeira tentativa.

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Corrigir um frontmatter quebrado

O que está errado neste frontmatter e como você corrigiria?

```markdown
---
name: My Amazing Tool
description: A tool
---
```

<!-- rubric -->
- Problema com `name` identificado (sem espaços, precisa ser minúsculas, usar hifens)
- Problema com `description` identificado (vaga demais, não diz o que faz)
- Proposta de melhoria concreta

<!-- answer -->
**Problemas:**

1. `name` tem espaços e letras maiúsculas. Deveria ser `my-amazing-tool` — embora o nome em si continue ruim, porque não diz nada sobre o que a Skill faz
2. `description` é apenas "A tool". Não diz o que a Skill faz nem quando recorrer a ela

**Uma versão melhor:**

```markdown
---
name: api-doc-generator
description: Gera documentação de API a partir de comentários no código, com suporte aos formatos JSDoc e docstring do Python
---
```

<!-- hint -->
Volte às regras de nomenclatura: letras minúsculas, dígitos, hifens

<!-- hint -->
Volte à fórmula da description: o que ela faz + quando usar + principais capacidades

### Nível 2: Escrever um frontmatter para o seu próprio caso

Pegue a tarefa que você encontrou no exercício da Lição 1 e escreva um frontmatter para ela.

<!-- rubric -->
- `name` segue as regras de nomenclatura (minúsculas, hifens, descritivo)
- `description` cobre o que faz, quando usar e as principais capacidades
- `description` cabe em uma frase, com menos de cerca de 200 caracteres

<!-- answer -->
Um exemplo, baseado na tarefa de feedback de clientes da Lição 1:

```markdown
---
name: feedback-classifier
description: Classifica o feedback de clientes vindo do Slack em relatos de bug, pedidos de funcionalidade e dúvidas de uso, marcando cada um com uma prioridade. Use no resumo diário de feedback
---
```

**Por que isso funciona:**
- `name` é descritivo — você sabe o que é à primeira vista
- `description` cobre o que faz (organiza e classifica feedback), o que entra (feedback de clientes do Slack), o que sai (categorias mais prioridade) e quando usar (o resumo diário)

<!-- hint -->
Se você está em dúvida se uma description é boa, pergunte a si mesmo: quais palavras em um pedido deveriam fazer o Claude pensar nesta Skill? Coloque essas palavras na description.

<!-- /exercises -->

## Recapitulação

- **O SKILL.md tem duas partes**: YAML frontmatter (metadados) e instruções em Markdown (orientações)
- **Campos obrigatórios do frontmatter**: `name` (minúsculas, hifens, único) e `description` (o que impulsiona o acionamento automático)
- **A fórmula da description**: o que ela faz + quando usar + principais capacidades
- **Três características de boas instruções**: seções claras, passos concretos, exemplos trabalhados
- **Como as partes se encaixam**: o frontmatter permite que o Claude encontre a Skill; as instruções permitem que o Claude a execute

Na próxima lição, começamos do zero e escrevemos uma Skill completa de ponta a ponta.

[>> Lição 3: Mão na massa: escrevendo sua primeira Skill](./03-first-skill.md)
