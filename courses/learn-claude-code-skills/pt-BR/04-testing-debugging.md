# Lição 4: Testes e depuração: garantindo que sua Skill se comporte

> Objetivos de aprendizado:
> - Conhecer as formas básicas de testar uma Skill
> - Diagnosticar as falhas que você vai realmente encontrar
> - Entender o ciclo de iteração
> - Saber como avaliar se uma Skill vale mesmo a pena manter
>
> Pré-requisitos: [<< Lição 3](./03-first-skill.md) | Próxima: [Lição 5 >>](./05-code-review-skill.md)

## Sua primeira Skill não vai sair certa

Você escreveu sua primeira Skill, executou e percebeu coisas assim:

- Algumas tarefas não foram reconhecidas de jeito nenhum
- As prioridades saíram erradas
- O formato de saída ficou uma bagunça
- Ou o Claude nem chegou a carregar a Skill

**Isso é normal.**

Skills são como código: fazer rodar uma vez é a linha de largada, não a chegada. Toda Skill realmente útil chegou lá depois de várias rodadas de revisão.[^S8]

Esta lição te dá um jeito repetível de encontrar e corrigir esses problemas.

## Método de teste 1: invocar diretamente

**O teste mais simples é a invocação direta: chame uma vez com `/skill-name` e observe o que sai.**[^S1]

### Prepare seus casos de teste

Antes de invocar qualquer coisa, escreva de três a cinco entradas.

**Casos normais:**
```
Terminar o relatório trimestral
Revisar o PR #234, antes de sexta
Corrigir o bug de login amanhã
```

**Casos-limite:**
```
(entrada vazia)
```

**Casos de lixo:**
```
Este é um parágrafo de texto completamente sem relação, sem nenhuma tarefa dentro
asldfkjasldfj!@#$%
```

### Rode os testes

No Claude Code, forneça uma de cada vez:

```
/task-organizer

Terminar o relatório trimestral
Revisar o PR #234, antes de sexta
Corrigir o bug de login amanhã
```

**Observe três coisas:**

1. **O Claude chegou a carregar a Skill?** (Se não, o problema está na description.)
2. **O formato de saída está correto?** (Se estiver bagunçado, o problema está na sua seção de formato de saída.)
3. **O conteúdo é o que você esperava?** (Se as categorias estiverem erradas, o problema está nos seus passos de processamento.)

### Anote o que aconteceu

Uma tabela pequena já basta:

| Entrada | Esperado | Real | Problema |
|---------|----------|------|----------|
| "Terminar o relatório trimestral\nCorrigir o bug amanhã" | 2 tarefas; o bug é urgente | Só 1 tarefa encontrada | As quebras de linha não estão sendo tratadas como separadores |

## Método de teste 2: observar o comportamento de carregamento

Às vezes o problema não está nas instruções — está no frontmatter.

### Problema: o Claude não carrega a Skill sozinho

**O que você vê:** você diz “me ajuda a organizar essas tarefas” e o Claude ignora sua Skill task-organizer.

**Causas prováveis:**

1. **A description é genérica demais**
   ```yaml
   description: Lida com tarefas  # Vago demais — o Claude não faz ideia de quando isso se aplica
   ```

   **Correção:** coloque as palavras-gatilho ali.
   ```yaml
   description: Organiza itens de to-do e os agrupa por prioridade e prazo. Use para listas de tarefas bagunçadas ou itens de ação de reunião
   ```

2. **A description não contém as palavras que você realmente usa**

   Se você diz “me ajuda a organizar esses to-dos” mas “to-do” não aparece em lugar nenhum da description, o Claude pode nunca se lembrar da Skill.[^S6]

   **Correção:** escreva na description as palavras que um usuário plausivelmente diria.

### Problema: o Claude carrega a Skill errada

**O que você vê:** você queria a task-organizer, mas o Claude pegou outra coisa.

**Causa provável:** a description da outra Skill combina melhor com a sua entrada.

**Correção:** force a chamada com `/task-organizer`, ou afie sua description para que ela fique mais específica que a da concorrente.

## Diagnosticando falhas comuns

### Problema 1: o formato de saída está errado

**O que você vê:** a Skill roda, mas a formatação sai errada.

**Exemplo:**

```
Urgente: Corrigir o bug de login - amanhã
Importante: Revisar o PR #234 - sexta
```

Você queria seções agrupadas com emoji e títulos; o Claude te deu uma lista de texto plana.

**Causa:** a seção de formato de saída não é específica o bastante, ou não tem exemplo.

**Correção:** coloque um exemplo completo na seção “Formato de saída” do seu SKILL.md:

```markdown
## Formato de saída

A saída deve seguir exatamente este formato, incluindo os emoji, os títulos e a indentação:

### 🔴 Urgente (hoje ou amanhã)
- Corrigir o bug de login - amanhã

### 🟡 Importante (esta semana)
- Revisar o PR #234 - sexta

### ⚪ Normal
- Terminar o relatório trimestral - sem prazo declarado
```

**Diga “deve seguir exatamente este formato” e depois mostre a coisa inteira.**

### Problema 2: o reconhecimento é impreciso

**O que você vê:** algumas tarefas passam batido, ou caem na categoria errada.

**Exemplo:**

Entrada:
```
Preciso corrigir aquele bug amanhã
Deixar a demo pronta antes de sexta
```

Saída:
```
### ⚪ Normal
- Preciso corrigir aquele bug amanhã - sem prazo declarado
- Deixar a demo pronta antes de sexta - sem prazo declarado
```

As duas têm prazo claro, e as duas foram marcadas como se não tivessem.

**Causa:** as regras de reconhecimento de tempo nos seus passos de processamento não cobrem casos suficientes.

**Correção:** complete-as.

```markdown
2. **Identificar informação de tempo**
   - Procure palavras-chave de data:
     * hoje, hoje à noite
     * amanhã
     * depois de amanhã
     * esta semana, de segunda a domingo
     * semana que vem, próxima <dia da semana>
     * datas explícitas (2024-01-15, 15 de janeiro, 15/1)
   - Procure formulações de prazo:
     * antes de X, até X
     * vence X, prazo X
     * precisa estar pronto até X
```

**A ideia:** explicite todas as formulações em que você conseguir pensar.

### Problema 3: casos-limite escapam

**O que você vê:** entradas normais funcionam, mas entradas incomuns fazem a Skill se comportar de forma estranha.

**Exemplo:**

Entrada: uma string vazia

Saída: o Claude trava, ou produz um monte de texto sem sentido.

**Causa:** sua seção “Observações” nunca disse o que fazer com entrada vazia.

**Correção:**

```markdown
## Observações

- **Com entrada vazia ou sem tarefas válidas**, exiba "Nenhuma tarefa válida encontrada — forneça uma lista de itens de to-do"
- **Quando nenhuma tarefa tiver informação de tempo**, coloque tudo em "Normal" e adicione a observação "Nenhum prazo explícito detectado"
- **Quando a descrição de uma tarefa passar de 100 caracteres**, trunque nos primeiros 80 mais "..."
- **Quando a entrada contiver itens concluídos (`[x]`)**, ignore-os
```

## O ciclo de iteração

**Boas Skills não são escritas de uma vez. Elas saem de um ciclo testar-corrigir-testar:**[^S8]

```
1. Escreva a primeira versão (só o comportamento central)
2. Rode contra 3-5 casos de teste
3. Anote o que deu errado
4. Edite o SKILL.md
5. Teste de novo
6. Repita 3-5 até todos os casos de teste passarem
7. Use de verdade por uma semana
8. Encontre problemas novos
9. Volte ao passo 4
```

**Não espere que a versão um esteja certa.** Faça rodar, depois faça funcionar direito, depois faça ficar bom.

```agentmentor-check
{
  "id": "skills-zh-04-diagnosis",
  "label": "Diagnóstico de uma falha de carregamento",
  "prompt": "Você criou uma Skill chamada changelog-gen que transforma commits do Git em um changelog. A description dela diz “Gera um changelog.” No Claude Code você diz “me ajuda a gerar um changelog”, mas o Claude nunca carrega a Skill. Qual é a causa mais provável?",
  "whyHere": "Você acabou de ver como a description conduz o carregamento automático. Isto verifica se você consegue distinguir uma falha de descoberta (o Claude nunca se lembrou da Skill) de uma falha de instalação (a Skill nem está lá) — as duas parecem idênticas de fora, mas têm correções completamente diferentes.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "O arquivo da Skill está salvo no diretório errado, então o Claude não consegue vê-lo",
      "correct": false,
      "feedback": "Se o arquivo estivesse no lugar errado, `/changelog-gen` também não funcionaria. O sintoma aqui é que o Claude não a carregou *automaticamente*, o que significa que a Skill existe e era legível — a description simplesmente não a trouxe à mente."
    },
    {
      "id": "b",
      "text": "A description é genérica demais e não tem palavras-gatilho",
      "correct": true,
      "feedback": "Correto. “Gera um changelog” nunca diz qual é a entrada (commits do Git) nem quando recorrer a ela. A palavra “changelog” até aparece, mas “gera” não carrega sinal nenhum. Reescreva como “Transforma o histórico de commits do Git em um changelog voltado ao cliente” — agora a entrada (commits) e o cenário (voltado ao cliente, histórico) estão ambos ali, e o Claude consegue casar com eles."
    }
  ]
}
```

## A Skill é realmente útil?

Depois que ela roda corretamente, resta uma pergunta maior: **essa Skill está mesmo economizando seu tempo?**[^S8]

### Faça um A/B

A comparação é simples: rode a mesma tarefa várias vezes com e sem a Skill, e cronometre as duas.

**Sem a Skill:**

Cronometre. Você explica o processo na mão, o Claude executa — quanto tempo isso leva em média?

**Com a Skill:**

Cronometre. Você invoca a Skill, o Claude executa — quanto tempo em média?

**Se a versão com Skill não for mais rápida, ou a qualidade for pior, a Skill ainda precisa de trabalho.**

### Use por uma semana

O teste de verdade é o uso de verdade.[^S10]

**Acompanhe estes números:**

- Quantas vezes você a invocou
- Quantas vezes o resultado foi usável como estava, sem edições manuais
- Quantas vezes você teve que rodar de novo ou corrigir a saída na mão
- Quanto tempo ela economizou

**Se você a invocou menos de três vezes em uma semana, a tarefa provavelmente não é repetitiva o bastante para justificar uma Skill.**

## Guia rápido de depuração

Quando uma Skill não funciona, comece por uma checagem de falha de carregamento — percorra a tabela abaixo e descarte o caminho do arquivo, o formato do frontmatter e as palavras-gatilho nessa ordem.

| Problema | Como diagnosticar | Onde corrigir |
|----------|-------------------|---------------|
| O Claude não carrega a Skill automaticamente | Verifique se a description contém as palavras que você realmente disse | Adicione palavras-gatilho, explicite o caso de uso |
| Formato de saída bagunçado | Verifique se você deu um exemplo completo de saída | Adicione o exemplo, adicione “deve seguir exatamente este formato” |
| Reconhecimento impreciso | Verifique se os passos de processamento enumeram todos os casos | Adicione regras, adicione mais critérios de decisão |
| Casos-limite se comportam mal | Verifique se “Observações” cobre esse caso | Adicione tratamento explícito para o caso especial |
| A Skill existe mas não é invocada | Verifique o caminho do arquivo, verifique o formato do frontmatter | Confirme que os marcadores `---` estão no lugar certo e que a indentação do YAML é válida |

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Depure sua própria Skill

Pegue a Skill que você construiu na Lição 3 e submeta-a a uma passada completa de testes:

1. Prepare 3 casos de teste (um normal, um limite, um de lixo)
2. Registre a saída esperada e a real de cada um
3. Encontre pelo menos um problema concreto
4. Edite o SKILL.md
5. Teste de novo e confirme que o problema sumiu

<!-- rubric -->
- Casos de teste cobrem entrada normal, limite e de lixo
- Saída esperada e real ambas registradas
- Ao menos um problema específico identificado (não “parece meio estranho”)
- Uma parte específica do SKILL.md foi alterada
- Retestado e a correção confirmada

<!-- answer -->
Uma passada de depuração de exemplo:

**Caso de teste 1 (normal):**
- Entrada: `"Terminar o relatório\nCorrigir o bug amanhã"`
- Esperado: 2 tarefas, o bug é urgente
- Real: só 1 tarefa encontrada
- **Problema:** a quebra de linha `\n` não está sendo tratada como separador de tarefas

**Correção:** estenda o passo “Extrair tarefas”:
```markdown
1. **Extrair tarefas**
   - Divida por quebras de linha (\n) ou marcadores de lista
   - Cada linha, ou cada item que comece com `- `, é uma tarefa
```

**Reteste:** passa ✓

**Caso de teste 2 (limite):**
- Entrada: string vazia
- Esperado: exibir "Nenhuma tarefa válida encontrada"
- Real: exibiu "### ⚪ Normal (nenhuma tarefa)"
- **Problema:** a seção Observações nunca especificou a saída para entrada vazia

**Correção:** estenda “Observações”:
```markdown
- **Com entrada vazia**, exiba "Nenhuma tarefa válida encontrada — forneça uma lista de itens de to-do" e nada mais. Não imprima títulos de categoria.
```

**Reteste:** passa ✓

<!-- hint -->
“Casos-limite” incluem: entrada vazia, exatamente uma tarefa, todas as tarefas com a mesma prioridade, entrada muito longa, caracteres especiais.

<!-- hint -->
Se você não conseguir encontrar um problema, sua primeira versão foi sólida. Tente algo mais extremo — 100 tarefas de uma vez, ou descrições de tarefa contendo emoji.

### Nível 2: Compare com não usar Skill nenhuma

Faça a mesma tarefa duas vezes: uma com sua Skill, outra apenas descrevendo o que você quer direto ao Claude. Depois compare:

1. Qual foi mais rápida
2. Qual produziu resultados melhores
3. Qual foi mais consistente (mesmo formato de saída em execuções repetidas)

<!-- rubric -->
- A mesma tarefa concluída pelos dois caminhos
- Tempos registrados
- Qualidade e consistência avaliadas
- Uma afirmação clara de onde a Skill ganha — ou uma admissão honesta de que não ganha

<!-- answer -->
Uma comparação de exemplo:

**Tarefa:** organizar uma mensagem contendo 8 itens de to-do

**Sem a Skill:**
- Tempo: 45 segundos (15 segundos explicando o que eu queria + 30 segundos do Claude)
- Qualidade: categorias quase todas certas, formatação inconsistente
- Consistência: rodei 3 vezes, obtive um layout ligeiramente diferente a cada vez

**Com a Skill:**
- Tempo: 15 segundos (5 segundos para invocar + 10 segundos do Claude)
- Qualidade: categorias precisas, formatação exatamente como a Skill define
- Consistência: rodei 3 vezes, formato de saída idêntico todas as vezes

**Conclusão:** a versão com Skill é 3x mais rápida e muito mais consistente. Vale manter e melhorar.

<!-- hint -->
Se a versão com Skill não for mais rápida ou a qualidade for pior, não force. Volte e questione se essa tarefa combina mesmo com uma Skill.

<!-- /exercises -->

## Recapitulação

- **Sua primeira Skill não vai sair certa** — chegar lá exige um ciclo testar-corrigir-testar
- **Métodos de teste:** invocar diretamente, observar o comportamento de carregamento, preparar casos de teste antes
- **Falhas comuns:** description genérica demais, formato de saída pouco especificado, regras de reconhecimento incompletas, casos-limite sem tratamento
- **Fluxo de depuração:** registre esperado vs. real, diagnostique, edite o SKILL.md, reteste
- **Provando que vale a pena:** compare tempo, qualidade e consistência com e sem a Skill, depois use por uma semana e conte as invocações

Na próxima lição vamos percorrer uma Skill completa de code review e ver como lidar com um fluxo de trabalho mais elaborado.

[>> Lição 5: Estudo de caso: construindo uma Skill de code review](./05-code-review-skill.md)
