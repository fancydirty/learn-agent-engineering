# Lição 3: Mão na massa: escrevendo sua primeira Skill

> Objetivos de aprendizado:
> - Criar a estrutura de diretórios de uma Skill
> - Escrever um SKILL.md completo do zero
> - Entender o princípio da revelação progressiva (progressive disclosure)
> - Invocar sua Skill pela primeira vez
>
> Pré-requisitos: [<< Lição 2](./02-skill-anatomy.md) | Próxima: [Lição 4 >>](./04-testing-debugging.md)

## O que vamos construir

Nesta lição vamos construir do zero uma Skill real e utilizável: um **organizador de tarefas**.

**O que ela faz:**
- Entrada: um monte de tarefas bagunçadas (texto solto, texto extraído de uma captura de tela, anotações de reunião)
- Saída: uma lista organizada, agrupada por prioridade e prazo

**Por que esta:**
- É simples — nenhuma lógica complicada atrapalhando
- É útil — você pode começar a usar hoje
- Ela exercita todas as partes centrais da estrutura de uma Skill

## Passo 1: criar o diretório e o arquivo

Abra um terminal e execute:

```bash
# Cria o diretório de skills pessoais (se você ainda não tiver um)
mkdir -p ~/.claude/skills

# Cria o diretório da Skill
mkdir ~/.claude/skills/task-organizer

# Cria o arquivo SKILL.md
touch ~/.claude/skills/task-organizer/SKILL.md
```

**Sua estrutura de diretórios agora está assim:**

```
~/.claude/skills/
└── task-organizer/
    └── SKILL.md
```

Abra o `SKILL.md` no editor de texto de sua preferência (VS Code, Cursor, o que você usar).

## Passo 2: escrever o frontmatter

Comece pelos metadados no topo do arquivo: [^S1]

```markdown
---
name: task-organizer
description: Organiza itens de uma lista de tarefas e os agrupa por prioridade e prazo. Use em listas de tarefas bagunçadas, itens de ação de reuniões ou backlogs de projeto
---
```

**Checklist:**
- ✓ `name` está em minúsculas e com hifens
- ✓ `description` cobre o que ela faz (organiza tarefas), o que recebe (uma lista bagunçada) e quando recorrer a ela (itens de ação de reuniões, backlogs de projeto)

## Passo 3: escrever o título e a introdução

Depois do frontmatter, adicione um título:

```markdown
# Organizador de tarefas

Extraia tarefas de texto sem estrutura e organize-as em uma lista estruturada por prioridade e prazo.
```

**Por que se dar ao trabalho de escrever título e introdução:**
- O título é para humanos — volte a este arquivo daqui a três meses e você lembrará para que ele serve num relance
- A introdução é para o Claude — ela preenche os detalhes que não couberam na `description`

## Passo 4: definir o formato de entrada

Diga ao Claude que tipo de entrada aceitar: [^S5]

````markdown
## Formato de entrada

Aceite uma lista de tarefas em qualquer uma destas formas:

- Uma lista em texto simples (uma tarefa por linha)
- Uma checklist em Markdown (`- [ ] texto da tarefa`)
- Mensagens com marcadores de tempo ("preciso terminar X até amanhã")
- Itens de ação enterrados em anotações de reunião

**Exemplo de entrada:**

```
Finalizar o relatório trimestral
- [ ] Revisar o PR #234
Preciso corrigir aquele bug de login amanhã
Preparar a demo antes de sexta
Atualizar a documentação
```
````

**O que esta seção realiza:**
- Ela enumera todos os formatos de entrada que a Skill pode encontrar
- Ela dá um exemplo concreto, para que o Claude saiba como é uma entrada real

## Passo 5: escrever os passos de processamento

Este é o coração das instruções, e precisa ser específico: [^S5]

```markdown
## Passos de processamento

Percorra estes passos em ordem:

1. **Extraia as tarefas**
   - Cada linha ou item de lista é uma tarefa
   - Remova os marcadores de checkbox (`- [ ]` ou `- [x]`)
   - Mantenha a descrição central da tarefa

2. **Identifique a informação de tempo**
   - Procure palavras de data: hoje, amanhã, esta semana, nomes de dias (segunda, sexta), datas explícitas (2024-01-15)
   - Procure expressões de prazo: "até X", "vence em X", "antes de X"
   - Se não houver tempo explícito, marque como "sem prazo"

3. **Atribua uma prioridade**
   - Contém "urgente", "ASAP", "agora", "imediatamente" → Urgente
   - Contém "importante", "prioridade", "crítico" → Importante
   - Vence hoje ou amanhã → Urgente
   - Vence dentro desta semana → Importante
   - Todo o resto → Normal

4. **Ordene**
   - Dentro de um nível de prioridade, ordene por prazo, do mais próximo ao mais distante
   - Tarefas sem prazo vão por último dentro do seu nível
```

**Por que tanto detalhe:**

O Claude não é uma pessoa e não vai “entender o que você quis dizer”. Escreva “atribua uma prioridade” e ele não faz ideia de qual critério aplicar. Escreva “contém 'urgente' → Urgente” e não sobra nada para adivinhar. [^S2]

## Passo 6: definir o formato de saída

Diga ao Claude com o que o resultado deve parecer:

```markdown
## Formato de saída

Use esta estrutura, com emoji como marcador de prioridade:

### 🔴 Urgente (hoje ou amanhã)
- [tarefa] - prazo

### 🟡 Importante (esta semana)
- [tarefa] - prazo

### ⚪ Normal
- [tarefa] - prazo (se houver)

**Exemplo de saída:**

### 🔴 Urgente
- Corrigir o bug de login - amanhã
- Finalizar o relatório trimestral - hoje

### 🟡 Importante
- Revisar o PR #234 - sexta
- Preparar a demo - sexta

### ⚪ Normal
- Atualizar a documentação - sem prazo
```

**O que o exemplo garante para você:**

Uma vez que o Claude viu um exemplo, o layout, os símbolos e a formatação estão resolvidos. Nada de adivinhar onde vai o emoji ou se o horário vem antes ou depois da tarefa.

## Passo 7: lidar com os casos de borda

Explicite como tratar os casos estranhos:

```markdown
## Observações

- Se a entrada estiver vazia ou nenhuma tarefa puder ser identificada, retorne "Nenhuma tarefa válida encontrada"
- Se nenhuma das tarefas trouxer informação de tempo, coloque todas em Normal
- Se a descrição de uma tarefa ficar longa (mais de 100 caracteres), mantenha os primeiros 80 e acrescente "..."
- Ignore tarefas já marcadas como concluídas (`[x]`)
```

## O arquivo completo

Seu `SKILL.md` agora deve estar assim:

```markdown
---
name: task-organizer
description: Organiza itens de uma lista de tarefas e os agrupa por prioridade e prazo. Use em listas de tarefas bagunçadas, itens de ação de reuniões ou backlogs de projeto
---

# Organizador de tarefas

Extraia tarefas de texto sem estrutura e organize-as em uma lista estruturada por prioridade e prazo.

## Formato de entrada

Aceite uma lista de tarefas em qualquer uma destas formas:

- Uma lista em texto simples (uma tarefa por linha)
- Uma checklist em Markdown (`- [ ] texto da tarefa`)
- Mensagens com marcadores de tempo ("preciso terminar X até amanhã")
- Itens de ação enterrados em anotações de reunião

## Passos de processamento

Percorra estes passos em ordem:

1. **Extraia as tarefas**
   - Cada linha ou item de lista é uma tarefa
   - Remova os marcadores de checkbox
   - Mantenha a descrição central da tarefa

2. **Identifique a informação de tempo**
   - Procure palavras de data: hoje, amanhã, esta semana, nomes de dias, datas explícitas
   - Procure expressões de prazo: "até X", "vence em X"
   - Se não houver tempo explícito, marque como "sem prazo"

3. **Atribua uma prioridade**
   - Contém "urgente", "ASAP", "agora", ou vence hoje/amanhã → Urgente
   - Contém "importante", "prioridade", ou vence dentro desta semana → Importante
   - Todo o resto → Normal

4. **Ordene**
   - Dentro de um nível de prioridade, ordene por prazo, do mais próximo ao mais distante

## Formato de saída

### 🔴 Urgente (hoje ou amanhã)
- [tarefa] - prazo

### 🟡 Importante (esta semana)
- [tarefa] - prazo

### ⚪ Normal
- [tarefa] - prazo (se houver)

## Observações

- Se a entrada estiver vazia, retorne "Nenhuma tarefa válida encontrada"
- Se nenhuma das tarefas trouxer informação de tempo, coloque todas em Normal
- Se a descrição de uma tarefa ficar longa (mais de 100 caracteres), mantenha os primeiros 80 e acrescente "..."
- Ignore tarefas já marcadas como concluídas (`[x]`)
```

Salve o arquivo.

## Passo 8: sua primeira invocação

Abra o Claude Code e digite:

```
/task-organizer

Finalizar o relatório trimestral
Revisar o PR #234, até sexta
Corrigir o bug de login amanhã
Atualizar a documentação
Urgente: problema de pagamento relatado por um cliente
```

O Claude deve devolver:

```
### 🔴 Urgente
- Corrigir o bug de login - amanhã
- Problema de pagamento relatado por um cliente - sem prazo

### 🟡 Importante
- Revisar o PR #234 - sexta

### ⚪ Normal
- Finalizar o relatório trimestral - sem prazo
- Atualizar a documentação - sem prazo
```

**Se a saída não estiver certa, não se desespere.** A próxima lição é inteiramente sobre depuração.

## Revelação progressiva: por que você não escreve todos os detalhes de cara

Você deve ter notado que esta Skill não diz nada sobre tarefas que dependem de outras tarefas, nem sobre tarefas atribuídas a pessoas diferentes. [^S2][^S5]

**Isso é de propósito.**

**Revelação progressiva: dê ao Claude apenas o que ele precisa agora, em vez de despejar tudo de uma vez.** [^S2]

A primeira versão faz o trabalho central e nada mais — extrair, classificar, ordenar. Use por alguns dias e, se você perceber que realmente precisa de atribuição de tarefas, adicione naquele momento.

**O que você ganha com isso:**
- Um arquivo de Skill curto: menos contexto consumido, carregamento mais rápido
- Lógica simples: menos formas de dar errado
- Confirmação rápida de que o comportamento central de fato funciona

Coloque a versão um para rodar e então itere. É assim que toda boa Skill é construída. [^S2]

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Criar sua própria primeira Skill

Pegue a tarefa que você definiu nos exercícios das Lições 1 e 2 e construa um SKILL.md completo para ela.

**Requisitos:**
1. Crie a estrutura de diretórios
2. Escreva um frontmatter completo (name + description)
3. Escreva instruções cobrindo no mínimo: formato de entrada, passos de processamento, formato de saída
4. Salve o arquivo
5. Invoque a Skill uma vez no Claude Code

<!-- rubric -->
- Estrutura de diretórios correta (`~/.claude/skills/nome-da-sua-skill/SKILL.md`)
- name e description do frontmatter seguindo as convenções
- Instruções cobrindo as três partes: entrada, passos, saída
- Passos específicos o bastante (nada de vaguezas como “analise os dados”)
- Ao menos uma invocação bem-sucedida, independentemente de o resultado ter saído certo

<!-- answer -->
Exemplo (construído em torno de uma tarefa de triagem de feedback de clientes):

```markdown
---
name: feedback-classifier
description: Classifica o feedback de clientes do Slack em relatos de bug, pedidos de funcionalidade e dúvidas de uso, e marca cada um com uma prioridade. Use no resumo diário de feedback
---

# Classificador de feedback

Extraia o feedback de clientes das mensagens do Slack e organize-o por tipo e prioridade.

## Formato de entrada

Aceita:
- Mensagens exportadas do Slack (texto simples)
- Texto extraído de capturas de tela de feedback de clientes
- Mensagens copiadas e coladas manualmente

## Passos de processamento

1. **Extraia o feedback**
   - Identifique o problema ou pedido central de cada mensagem
   - Descarte a conversa ao redor (saudações, agradecimentos e assim por diante)

2. **Determine o tipo**
   - Descreve um erro, uma queda ou algo que não funciona → Relato de bug
   - Pede uma nova capacidade ou uma experiência melhor → Pedido de funcionalidade
   - Pergunta como fazer algo ou por que funciona daquele jeito → Dúvida de uso

3. **Marque uma prioridade**
   - Afeta produção, impede as pessoas de trabalhar → P0 (mais alta)
   - Afeta alguns usuários, existe contorno → P1
   - Refinamento, seria bom ter → P2

4. **Extraia os detalhes principais**
   - Qual parte do produto está envolvida
   - Quem é o usuário (se mencionado)
   - Se é sensível ao tempo

## Formato de saída

### Relatos de bug
- [descrição] - prioridade - área

### Pedidos de funcionalidade
- [pedido] - prioridade - área

### Dúvidas de uso
- [dúvida] - área

## Observações

- Se uma mensagem levantar vários problemas distintos, divida em várias entradas
- Se a prioridade não estiver clara, marque como P1
- Preserve o carimbo de hora original quando houver
```

<!-- hint -->
Em dúvida se seus passos estão específicos o bastante? Pergunte a si mesmo: se um colega que nunca fez esta tarefa seguisse este arquivo linha por linha, ele acertaria?

<!-- hint -->
A primeira versão não precisa ser perfeita. Escreva o fluxo central, coloque para rodar, itere nos detalhes depois

### Nível 2: Testar os casos de borda

Alimente sua Skill com uma entrada que não seja bem-comportada, como:
- Entrada vazia
- Entrada com formato corrompido
- Entrada contendo caracteres especiais

Veja o que sai e anote. Vamos usar esse resultado para praticar depuração na próxima lição.

<!-- rubric -->
- Ao menos um caso de borda testado
- Registro tanto da entrada quanto da saída real
- Avaliação sobre a saída ter correspondido ou não ao esperado

<!-- answer -->
Teste de exemplo:

**Entrada:** string vazia

**Esperado:** deve retornar “Nenhuma tarefa válida encontrada”

**Saída real:** (registre o que o Claude de fato produziu)

**Correspondeu ao esperado:** (sim / não — se não, diga onde divergiu)

<!-- hint -->
Casos de borda a considerar: entrada vazia, entrada malformada, entrada muito longa, caracteres especiais, valores extremos

<!-- /exercises -->

## Recapitulação

- **Os 7 passos para construir uma Skill**: diretório → frontmatter → título → entrada → passos → saída → casos de borda
- **Os passos precisam ser específicos**: não “analise as tarefas”, mas “procure palavras de data: hoje, amanhã…”
- **Exemplos importam**: mostre ao Claude como a entrada e a saída realmente se parecem
- **Revelação progressiva**: a versão um faz só o trabalho central — não escreva todos os detalhes de cara
- **Como invocar**: `/skill-name` seguido da sua entrada

Na próxima lição tratamos de testar e depurar Skills — indo de “funciona” para “funciona corretamente”.

[>> Lição 4: Testando e depurando](./04-testing-debugging.md)
