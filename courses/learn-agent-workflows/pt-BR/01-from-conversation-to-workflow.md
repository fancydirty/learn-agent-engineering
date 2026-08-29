# Lição 1: Da conversa ao fluxo de trabalho: por que a orquestração existe

> Objetivos de aprendizado:
> - Entender a diferença fundamental entre uma única conversa e um fluxo de trabalho
> - Reconhecer as características de uma tarefa que se encaixa em um fluxo de trabalho
> - Compreender o valor central da orquestração de fluxos de trabalho
>
> Pré-requisitos: Você já usou o Claude Code ou uma ferramenta de IA similar | Próxima: [Lição 2 >>](./02-workflow-building-blocks.md)

## Seu agente bate na parede

Você pede ao Claude Code para refatorar uma base de código grande: “Divida este monólito de 5.000 linhas em microsserviços.”

O Claude começa a trabalhar. Ele lê arquivos, identifica fronteiras de módulos, extrai dependências e, em algum ponto por volta do arquivo 47, a janela de contexto enche. Ele esquece o que fez antes, recomeça do zero e trava em um loop.[^S3]

Ou você pede para ele “revisar todos os PRs abertos e escrever as release notes desta semana”. O Claude só consegue lidar com um PR por vez, então você o executa 20 vezes na mão, reexplicando as regras de formatação a cada passagem.

Esse é o teto de uma única conversa: uma conversa, uma janela de contexto, uma cadeia de raciocínio. Para tarefas complexas, esse padrão desmorona.[^S1]

## O que é um fluxo de trabalho

Um fluxo de trabalho é um script executável que quebra uma tarefa complexa em passos, delega cada passo a um agente novo e coordena o conjunto todo por conta própria.[^S2]

As diferenças principais:

| Dimensão | Conversa única | Fluxo de trabalho |
|------|---------|--------|
| Fluxo de controle | O agente decide o que fazer em seguida | O script decide o que fazer em seguida |
| Contexto | Todo o histórico vive em uma única janela | Cada passo ganha seu próprio contexto |
| Paralelismo | Executa sequencialmente | Pode iniciar vários agentes de uma vez |
| Repetibilidade | Pode variar a cada execução | Script fixo, execuções determinísticas |
| Escala adequada | Tarefas pequenas (poucos arquivos) | Tarefas grandes (centenas de arquivos, vários estágios de validação) |

Por exemplo, um fluxo de trabalho de refatoração pode ter esta cara:

```javascript
// Exemplo em pseudocódigo
async function refactorWorkflow(codebase) {
  // Passo 1: analisar todos os módulos em paralelo
  const modules = await Promise.all(
    codebase.files.map(file => 
      agent({ task: `Analise as responsabilidades e dependências de ${file}` })
    )
  );
  
  // Passo 2: propor fronteiras de microsserviços
  const plan = await agent({ 
    task: 'Projete fronteiras de microsserviços a partir da análise',
    context: modules 
  });
  
  // Passo 3: extrair cada serviço em paralelo
  const services = await Promise.all(
    plan.services.map(svc => 
      agent({ task: `Extraia o código do serviço ${svc.name}` })
    )
  );
  
  // Passo 4: verificar se os testes de cada serviço passam
  return await agent({ 
    task: 'Rode a suíte de testes de cada serviço',
    context: services 
  });
}
```

O script guarda os loops, as ramificações e os resultados intermediários; o contexto do Claude só chega a ver a resposta final. A orquestração é determinística, e apenas o trabalho dentro de cada passo é conduzido pelo modelo.[^S2]

## Quando um fluxo de trabalho se encaixa

Quatro características marcam uma tarefa que se encaixa em um fluxo de trabalho:

1. **Mais agentes do que uma conversa consegue coordenar.** Uma única conversa dá conta de 3 a 5 subagentes; além disso, você precisa de um fluxo de trabalho.
2. **Você quer a orquestração codificada como um script legível e reutilizável.** Escreva uma vez, execute de novo quando quiser.
3. **A tarefa se divide em fases claras.** Analisar, planejar, implementar, verificar.
4. **Você precisa de execução paralela ou de verificação cruzada.** Subtarefas independentes, validação adversarial, comparação em formato de torneio.

A documentação oficial diz sem rodeios: "Reach for a workflow when a task needs more agents than one conversation can coordinate, or when you want the orchestration codified as a script you can read and rerun." (recorra a um fluxo de trabalho quando uma tarefa precisar de mais agentes do que uma conversa consegue coordenar, ou quando você quiser a orquestração codificada como um script que dá para ler e reexecutar)[^S1]

Cenários típicos:

- **Auditoria de base de código.** Varrer 500 arquivos, um agente por arquivo checando problemas de segurança, e depois agregar os resultados.
- **Migração em larga escala.** Atualizar 200 componentes de Vue 2 para Vue 3 em paralelo, e verificar a integração no final.
- **Pesquisa com verificação cruzada.** Colocar 5 agentes para pesquisar a mesma questão de forma independente, cruzar os fatos e produzir um relatório de consistência.
- **Revisão de design sob vários ângulos.** Avaliar um design por três ângulos (arquitetura, performance, custo) de forma independente e depois juntar tudo.[^S1]

Quando o fluxo de trabalho é a ferramenta errada:

- Edições simples em um único arquivo ou revisões de código, em que uma conversa direta já basta.
- Trabalho aberto, como escrita criativa ou brainstorming.
- Tarefas que exigem muito julgamento humano e não podem ser reduzidas a passos.

```agentmentor-check
{
  "id": "workflows-zh-01-scenario-judge",
  "label": "Julgamento de um cenário de geração de documentação",
  "prompt": "Você precisa gerar a documentação de API de 10 microsserviços. Cada serviço tem de 20 a 30 endpoints, e o trabalho é: extrair as interfaces do código, gerar exemplos, checar consistência e, no final, consolidar tudo em um documento unificado. Esse cenário se encaixa em um fluxo de trabalho?",
  "whyHere": "Você acabou de aprender as quatro características que marcam uma tarefa com formato de fluxo de trabalho (quantidade de agentes, script reutilizável, fases claras, execução paralela). Esta checagem verifica se você consegue aplicar esses critérios a um caso concreto e se não vai rotular como trabalho criativo aberto uma tarefa altamente estruturada e repetível.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Não, porque gerar documentação é trabalho criativo e não pode ser reduzido a passos.",
      "correct": false,
      "feedback": "Gerar documentação de API não é trabalho criativo; é uma tarefa altamente estruturada: extrair, gerar, validar, agregar. Cada passo tem entradas e saídas bem definidas, que é exatamente o que combina com um fluxo de trabalho."
    },
    {
      "id": "b",
      "text": "Sim, porque coordena 10 agentes em paralelo, tem fases claras e roda em paralelo.",
      "correct": true,
      "feedback": "Correto. Esse cenário atinge todas as características: 10 serviços passam do que uma única conversa consegue gerenciar, o processo pode ser congelado em um script reutilizável, as fases são claras e a documentação de cada serviço pode ser gerada em paralelo antes da consolidação final."
    }
  ]
}
```

## Como os fluxos de trabalho evoluíram

Os fluxos de trabalho não surgiram do nada. Eles são o quarto estágio da capacidade de orquestração do Claude Code:[^S3]

**Estágio 1: agente monolítico**
```
┌─────────┐
│ Claude  │  Uma única janela de contexto faz tudo:
└─────────┘  ler, planejar, editar, testar
```

**Estágio 2: fan-out de subagentes (a ferramenta Agent)**
```
┌─────────┐
│ Claude  │──→ agent: "busque na base de código"
│ (main)  │──→ agent: "leia estes 40 arquivos"
└─────────┘  os resultados voltam para o agente pai
```

**Estágio 3: times de agentes**
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Planejador  │───→│ Programador │───→│ Testador    │
└─────────────┘    └─────────────┘    └─────────────┘
     cada agente mantém seu próprio papel e contexto
```

**Estágio 4: orquestração por fluxo de trabalho**
```
    ┌─────────────────────────────┐
    │ Script de fluxo de trabalho │  guarda loops, ramificações, estado
    └────────────┬────────────────┘
         ┌───────┴───────┬───────┐
         ↓       ↓       ↓       ↓
    agent()  agent() agent() agent()
    cada chamada inicia um subagente independente
```

A inovação central de um fluxo de trabalho é a inversão do fluxo de controle: em vez de deixar o agente decidir “o que eu faço agora”, o script decide “qual agente eu chamo agora”.[^S2]

## O que é orquestração, de fato

A orquestração é exatamente o que o nome sugere: "one score, many musicians. A script deciding it — for loop, if statement — is orchestration." (uma partitura, muitos músicos; um script decidindo isso — um for, um if — é orquestração)[^S3]

Em um fluxo de trabalho:

- **A partitura** = o script JavaScript/TypeScript que você escreve, com seus loops `for`, suas instruções `if` e suas chamadas `Promise.all`.
- **Os músicos** = os subagentes que cada chamada `agent()` inicia.
- **O maestro** = o motor de execução do script, coordenando os agentes conforme a partitura.

Aqui está a distinção, nas palavras do guia que a batizou: "A normal agent decides the control flow as it goes. A workflow inverts that. You write the control flow as plain code, and each individual step is delegated to a fresh subagent." (um agente normal decide o fluxo de controle conforme avança; um fluxo de trabalho inverte isso: você escreve o fluxo de controle como código comum, e cada passo individual é delegado a um subagente novo)

Um agente normal improvisa em tempo de execução: “faça A primeiro, depois decida se faz B ou C”. Um fluxo de trabalho prende o fluxo de controle no código: “rode A1-A10 em paralelo, depois faça B quando todos terminarem; se B retornar `score > 0.8`, faça C, caso contrário D”.

O que a orquestração determinística te dá:

- **Previsível.** Mesma entrada, mesmo caminho de execução.
- **Depurável.** Fica óbvio qual passo falhou.
- **Reexecutável.** O script vive em `.claude/workflows/` e pode ser chamado pelo nome.
- **Escalável.** Ir de 10 agentes para 100 é só mudar a contagem do loop.[^S2]

## Seu primeiro cenário de fluxo de trabalho: um pipeline de revisão de código

Vamos olhar um caso real. Seu time tem 15 PRs esperando revisão, e cada PR precisa de quatro checagens:

1. O código segue o guia de estilo?
2. Existe algum bug óbvio?
3. A cobertura de testes é suficiente?
4. A documentação relevante foi atualizada?

Com uma única conversa, você executa isso 15 vezes, trocando de PR na mão a cada rodada.

Com um fluxo de trabalho:

```javascript
async function reviewPRsWorkflow(prList) {
  // Fase 1: revisar todos os PRs em paralelo
  const reviews = await Promise.all(
    prList.map(pr => 
      agent({
        task: `Revise o PR #${pr.number}`,
        prompt: `Cheque estilo de código, bugs em potencial, testes e docs.
                 Devolva JSON: { style: score, bugs: [], 
                 coverage: number, docs: boolean }`
      })
    )
  );
  
  // Fase 2: agregar o relatório
  return await agent({
    task: 'Gere o relatório semanal',
    prompt: `Com base nos resultados de revisão de ${reviews.length} PRs,
             produza o relatório de qualidade de código desta semana,
             ordenando os problemas por severidade`
  });
}
```

O que esse fluxo de trabalho te dá:

- 15 PRs revisados em paralelo, 15x mais rápido que na versão sequencial.
- Padrões de revisão consistentes (todo PR usa o mesmo prompt).
- Ele pode rodar automaticamente toda semana, sem passos manuais.
- O script vai para o Git e é compartilhado com o time.

<!-- exercises -->


## 💻 Exercícios

### Nível 1: Identifique seu primeiro cenário de fluxo de trabalho

Olhe para a sua última semana de trabalho, encontre uma tarefa repetitiva e julgue se ela se encaixa em um fluxo de trabalho:

**Critérios:**
- Precisa processar muitas entradas parecidas (muitos arquivos, muitas fontes de dados, muitos serviços)
- Tem fases claras (extrair, transformar, validar, produzir saída)
- Você quer que o processo rode do mesmo jeito toda vez
- Pode rodar parcial ou totalmente em paralelo

**Registre:**
1. A tarefa, em uma frase
2. Como você faz isso hoje
3. Se usasse um fluxo de trabalho, em quais fases ela se dividiria
4. Quanto tempo você esperaria economizar

<!-- rubric -->
O cenário está descrito com clareza, as fases são razoáveis (de 3 a 5), você consegue apontar onde a execução paralela ajuda e a estimativa de tempo tem embasamento (por exemplo, “processar 10 arquivos em sequência leva 30 minutos hoje; em paralelo, eu esperaria 5”).

<!-- answer -->
Exemplo de resposta — Tarefa: gerar changelogs para vários microsserviços. Hoje: ler manualmente os commits do Git de cada serviço e copiá-los para um documento. Fases do fluxo de trabalho: (1) puxar o histórico de commits de cada serviço em paralelo, (2) transformar os commits em descrições de mudança legíveis para o usuário, em paralelo, (3) consolidar tudo em release notes num formato unificado, (4) gerar um resumo dos destaques comparando com a versão anterior. Expectativa: cair de 45 minutos para 8, porque os passos 1 e 2 conseguem processar 8 serviços em paralelo.

<!-- hint -->
Comece por tarefas em que você faz a mesma operação em muitos objetos parecidos, como processar arquivos em lote, chamar uma API em lote ou gerar relatórios em lote.

<!-- hint -->
Um bom cenário de fluxo de trabalho costuma ter o formato espalhar, processar, agregar: distribua a tarefa entre muitos agentes, cada um cuidando de uma fatia, e depois junte os resultados.

### Nível 2: Compare uma conversa única com um fluxo de trabalho

Escolha um destes dois cenários e explique por que um se encaixa em uma conversa única e o outro em um fluxo de trabalho:

**Cenário A:** Corrigir um bug em uma função de 50 linhas com lógica clara.

**Cenário B:** Atualizar uma biblioteca de interface com 30 componentes de Material-UI v4 para v5.

Escreva seu julgamento e o raciocínio (de 2 a 3 frases por cenário).

<!-- rubric -->
Identifica corretamente que o Cenário A se encaixa em uma conversa única (tarefa pequena, contexto gerenciável, sem necessidade de paralelismo) e que o Cenário B se encaixa em um fluxo de trabalho (escala grande, decomponível, paralelizável); explica o porquê em vez de apenas repetir definições; cita um benefício concreto do fluxo de trabalho (paralelismo, consistência, repetibilidade).

<!-- answer -->
O Cenário A se encaixa em uma conversa única. Corrigir um bug em uma função tem escopo pequeno; 50 linhas cabem inteiras em uma janela de contexto, e o agente consegue ler, entender, corrigir e verificar diretamente, sem nada para decompor. O Cenário B se encaixa em um fluxo de trabalho. Trinta componentes passam do que uma conversa consegue gerenciar com eficiência, e componentes costumam ser independentes, então você pode atualizá-los em paralelo (um agente por componente) e depois rodar testes de integração para verificar. O fluxo de trabalho garante que todo componente use as mesmas regras de atualização, para que nada passe batido.

<!-- hint -->
Pergunte a si mesmo: se uma pessoa fizesse essas duas tarefas, o Cenário A é do tipo que você senta e termina em 10 minutos, ou é um trabalho maior, que leva dias, exige um checklist e passos escalonados?

<!-- hint -->
A palavra-chave do Cenário B é “30 componentes”. Quando a contagem passa de 10, considere um fluxo de trabalho; quando uma tarefa pode ser descrita como “faça a mesma operação em N objetos”, um fluxo de trabalho quase sempre é a escolha melhor.

<!-- /exercises -->

---

**Próxima:** [Lição 2 >>](./02-workflow-building-blocks.md) — Blocos de construção de um fluxo de trabalho: passos, estado, ramificações e loops
