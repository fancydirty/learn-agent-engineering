# Lição 4: Gerenciamento de estado e passagem de contexto

> Objetivos de aprendizado:
> - Distinguir o estado do fluxo de trabalho do contexto do agente
> - Dominar três padrões de gerenciamento de estado
> - Entender checkpoint e recuperação
>
> Pré-requisitos: [Lição 3: Decompondo uma tarefa complexa em um fluxo de trabalho](./03-task-decomposition.md) | Próxima: [Lição 5 >>](./05-error-handling-retry.md)

## Por que o gerenciamento de estado é o coração de um fluxo de trabalho

Você projeta um fluxo de trabalho perfeito: 10 passos, dependências limpas. No passo 8, o servidor reinicia. O fluxo de trabalho quebra.

Rodar tudo de novo? Aí o trabalho dos 7 primeiros passos — talvez 30 minutos dele — vai para o lixo.

**Esse é o preço de não ter gerenciamento de estado.**

O gerenciamento de estado resolve três problemas:[^S12]

1. **Passagem de dados entre passos**: como o passo 3 recebe os resultados dos passos 1 e 2?
2. **Acompanhamento do progresso**: quanto o fluxo de trabalho já avançou? Quanto falta?
3. **Recuperação de falhas**: depois de uma queda, retomar de onde parou em vez de começar do zero.

Sem gerenciamento de estado, um agente só consegue passar informação pelo histórico da conversa. O histórico da conversa transborda, se perde e é esquecido pelo agente.

Com gerenciamento de estado, o fluxo de trabalho tem uma “memória” clara: persistente, consultável, recuperável.[^S11]

## Estado vs. contexto vs. memória

Essas três palavras são fáceis de confundir, então vamos fixá-las primeiro:[^S12]

**Estado**
- Todas as informações sobre a tarefa atual: em que passo você está, o resultado de cada passo, o que fazer em seguida
- É um instantâneo: tudo o que o fluxo de trabalho sabe neste momento
- Armazenado em: variáveis de script, um banco de dados, arquivos

**Contexto**
- A informação passada para uma única chamada de agente
- É entrada: o que este agente precisa saber para fazer seu trabalho
- Extraído seletivamente do estado: nem todo o estado vai para o agente, apenas a parte relevante

**Memória**
- Lições aprendidas no passado: o que já foi feito, que problemas apareceram, quais foram as soluções
- É histórico: conhecimento de longo prazo que atravessa tarefas e sessões
- Fora do escopo desta lição (memória de longo prazo é um tema difícil por si só)

**Um exemplo:**

```javascript
// Estado: tudo o que o fluxo de trabalho sabe
const workflowState = {
  phase: 'testing',
  filesProcessed: 47,
  totalFiles: 100,
  issues: [/* todos os problemas encontrados nos passos anteriores */],
  currentBatch: [/* arquivos sendo processados neste momento */]
};

// Contexto: as informações para este agente (extraídas do estado)
const agentContext = {
  file: workflowState.currentBatch[0],
  previousIssues: workflowState.issues.filter(i => i.severity === 'high')
};

// Chamada do agente
const result = await agent({
  task: 'testar arquivo',
  context: agentContext  // apenas a informação relevante, não o estado inteiro
});

// Atualiza o estado
workflowState.filesProcessed++;
workflowState.issues.push(...result.newIssues);
```

**O princípio central: o estado é global, o contexto é local.**[^S15]

## Padrão de estado 1: variáveis de script (estado em memória)

**Quando usar:** fluxos de trabalho curtos (< 10 minutos) que não precisam atravessar processos ou máquinas.

**Vantagem:** simples, rápido, sem dependências externas.

**Desvantagem:** o estado se perde quando o processo quebra, sem forma de recuperar.

### Padrão básico

```javascript
async function simpleWorkflow(files) {
  // O estado são apenas variáveis JavaScript comuns
  let processed = 0;
  let results = [];
  let errors = [];
  
  for (const file of files) {
    try {
      const result = await processFile(file);
      results.push(result);
      processed++;
      console.log(`Progresso: ${processed}/${files.length}`);
    } catch (error) {
      errors.push({ file, error });
    }
  }
  
  return { results, errors, total: files.length };
}
```

**Onde o estado vive?** Nas variáveis locais da função (`processed`, `results`, `errors`).

**E se o processo quebrar?** Todo o estado se perde, e você recomeça do início.

### Melhor: um objeto de estado estruturado

```javascript
async function betterWorkflow(files) {
  // Organize o estado em um objeto — fica mais claro
  const state = {
    input: { files, total: files.length },
    progress: { current: 0, phase: 'processing' },
    output: { results: [], errors: [] },
    metadata: { startTime: Date.now() }
  };
  
  for (const file of state.input.files) {
    try {
      const result = await processFile(file);
      state.output.results.push(result);
      state.progress.current++;
    } catch (error) {
      state.output.errors.push({ file, error });
    }
  }
  
  state.progress.phase = 'completed';
  state.metadata.endTime = Date.now();
  state.metadata.duration = state.metadata.endTime - state.metadata.startTime;
  
  return state;
}
```

**Por que isso ajuda:** o estado tem uma estrutura clara, é fácil de passar para outras funções e é fácil de serializar (caso você precise persistir).

## Padrão de estado 2: checkpoint

**Quando usar:** fluxos de trabalho de duração média (10-60 minutos) em que você precisa salvar o progresso depois de operações caras.

**Vantagem:** depois de uma queda, você pode retomar do checkpoint mais recente e evitar refazer trabalho.

**Desvantagem:** você precisa projetar os locais dos checkpoints e a lógica de recuperação.[^S12]

### Escolhendo os locais dos checkpoints

```javascript
async function workflowWithCheckpoints(tasks) {
  const checkpointFile = '.workflow-state.json';
  
  // Tenta restaurar o estado anterior
  let state = await loadCheckpoint(checkpointFile) || {
    completed: [],
    pending: tasks,
    phase: 'processing'
  };
  
  console.log(`Retomando: ${state.completed.length}/${tasks.length} concluídas`);
  
  while (state.pending.length > 0) {
    const task = state.pending.shift();
    
    // Executa a tarefa
    const result = await executeTask(task);
    state.completed.push({ task, result });
    
    // Checkpoint: salva a cada 10 tarefas
    if (state.completed.length % 10 === 0) {
      await saveCheckpoint(checkpointFile, state);
      console.log(`Checkpoint: ${state.completed.length} tarefas concluídas`);
    }
  }
  
  state.phase = 'completed';
  await saveCheckpoint(checkpointFile, state);
  
  return state;
}

async function saveCheckpoint(file, state) {
  await fs.writeFile(file, JSON.stringify(state, null, 2));
}

async function loadCheckpoint(file) {
  try {
    const data = await fs.readFile(file, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;  // o arquivo não existe, começa do zero
  }
}
```

**Estratégias de checkpoint:**

- **Checkpoints periódicos**: salvar a cada N tarefas ou a cada M minutos
- **Checkpoints por fase**: salvar depois que cada fase importante termina (por exemplo, “fase de análise concluída”)
- **Antes de operações críticas**: salvar antes de uma operação irreversível (por exemplo, um deploy, uma exclusão)

```agentmentor-check
{
  "id": "workflows-zh-04-checkpoint-placement",
  "label": "Avaliação do posicionamento de um checkpoint",
  "prompt": "Um fluxo de trabalho de migração de dados tem 4 fases: (1) ler 1000 registros do banco de dados de origem (5 minutos) (2) transformar o formato dos dados (10 minutos) (3) escrever no banco de dados de destino (20 minutos) (4) verificar a consistência dos dados (5 minutos). Se você puder definir apenas 1 checkpoint, depois de qual fase ele deve ficar?",
  "whyHere": "Você acabou de aprender o conceito de checkpoint e suas estratégias (periódico, por fase, antes de operações críticas); isto verifica se você consegue escolher o local ideal de checkpoint a partir das características de uma tarefa (custo de tempo, reversibilidade)",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Depois da fase 1, porque é a primeira fase",
      "correct": false,
      "feedback": "A fase 1 leva apenas 5 minutos, então executá-la de novo depois de uma queda custa pouco. Um checkpoint pertence a um ponto depois de uma operação longa ou irreversível, não simplesmente ao primeiro passo da sequência."
    },
    {
      "id": "b",
      "text": "Depois da fase 2, porque é a mais cara e vem antes da escrita",
      "correct": true,
      "feedback": "Correto. A fase 2 é a fase de computação pura mais longa (10 minutos), e a fase 3 é uma escrita irreversível. Um checkpoint depois da fase 2 evita reexecutar a transformação cara e salva o estado logo antes da escrita irreversível. Se a fase 3 falhar, você retoma do checkpoint, corrige o problema e escreve de novo — sem precisar reler e retransformar."
    },
    {
      "id": "c",
      "text": "Depois da fase 3, porque a escrita já terminou",
      "correct": false,
      "feedback": "Um checkpoint depois da fase 3 protege o resultado escrito, mas se a própria fase 3 falhar (quebrando no meio da escrita), o checkpoint nunca tem a chance de salvar. A estratégia melhor é salvar antes da fase 3, para que, em caso de falha, você possa corrigir o problema e escrever de novo."
    }
  ]
}
```

## Padrão de estado 3: armazenamento externo (estado persistente)

**Quando usar:** fluxos de trabalho de longa duração (> 1 hora), trabalho que precisa se coordenar entre máquinas ou trabalho que precisa de aprovação humana.

**Vantagem:** o estado é persistente; a queda de um processo ou o reinício de uma máquina não importam, e pausar/retomar é suportado.

**Desvantagem:** exige uma dependência externa (um banco de dados, Redis) e acrescenta complexidade.[^S13]

### Implementação básica

```javascript
// Interface do repositório de estado
class WorkflowStateStore {
  constructor(db) {
    this.db = db;
  }
  
  async save(workflowId, state) {
    await this.db.set(`workflow:${workflowId}`, JSON.stringify(state));
  }
  
  async load(workflowId) {
    const data = await this.db.get(`workflow:${workflowId}`);
    return data ? JSON.parse(data) : null;
  }
  
  async delete(workflowId) {
    await this.db.del(`workflow:${workflowId}`);
  }
}

// Um fluxo de trabalho apoiado em armazenamento externo
async function persistentWorkflow(workflowId, tasks) {
  const store = new WorkflowStateStore(redis);
  
  // Carrega o estado (se existir)
  let state = await store.load(workflowId) || {
    id: workflowId,
    phase: 'init',
    completed: [],
    pending: tasks,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  console.log(`Fluxo de trabalho ${workflowId}: fase ${state.phase}, 
               progresso ${state.completed.length}/${tasks.length}`);
  
  // Fase 1: processa as tarefas
  if (state.phase === 'init' || state.phase === 'processing') {
    state.phase = 'processing';
    
    while (state.pending.length > 0) {
      const task = state.pending.shift();
      const result = await executeTask(task);
      state.completed.push({ task, result });
      state.updatedAt = Date.now();
      
      // Salva o estado depois de cada tarefa
      await store.save(workflowId, state);
    }
    
    state.phase = 'awaiting_approval';
    await store.save(workflowId, state);
  }
  
  // Fase 2: espera a aprovação humana (pode retomar em outro processo/máquina)
  if (state.phase === 'awaiting_approval') {
    console.log('Aguardando aprovação...');
    // Podemos retornar aqui e deixar outro processo (ou algumas horas depois) continuar
    return { workflowId, status: 'awaiting_approval' };
  }
  
  // Fase 3: executa a operação final (depois da aprovação)
  if (state.phase === 'approved') {
    state.phase = 'finalizing';
    await store.save(workflowId, state);
    
    await executeFinalAction(state.completed);
    
    state.phase = 'completed';
    state.completedAt = Date.now();
    await store.save(workflowId, state);
  }
  
  return state;
}

// Fluxo de trabalho de aprovação
async function approveWorkflow(workflowId) {
  const store = new WorkflowStateStore(redis);
  const state = await store.load(workflowId);
  
  if (!state) throw new Error('o fluxo de trabalho não existe');
  if (state.phase !== 'awaiting_approval') {
    throw new Error(`não é possível aprovar: a fase atual é ${state.phase}`);
  }
  
  state.phase = 'approved';
  state.approvedAt = Date.now();
  await store.save(workflowId, state);
  
  // Continua executando o fluxo de trabalho
  return await persistentWorkflow(workflowId, []);
}
```

**O padrão central: uma máquina de estados**[^S11]

As fases do fluxo de trabalho são os estados de uma máquina de estados:

```
init → processing → awaiting_approval → approved → finalizing → completed
                         ↓
                     rejected → cancelled
```

Cada transição de fase é salva no armazenamento externo, e é isso que permite ao fluxo de trabalho retomar a partir de qualquer fase.

## Boas práticas para passar contexto

### Princípio 1: passe apenas o necessário

```javascript
// ❌ Ruim: entregar todo o estado ao agente
const result = await agent({
  task: 'analisar este arquivo',
  context: workflowState  // resultados da análise de 100 arquivos, configuração, logs...
});

// ✓ Bom: dar apenas a informação relevante
const result = await agent({
  task: 'analisar este arquivo',
  context: {
    file: currentFile,
    guidelines: workflowState.config.analysisGuidelines,
    similarIssues: workflowState.results
      .filter(r => r.file.type === currentFile.type)
      .slice(0, 3)  // no máximo 3 casos parecidos
  }
});
```

**Por quê?** Quanto maior o contexto, mais fácil é o agente se distrair; a qualidade do raciocínio cai e o custo sobe.[^S15]

### Princípio 2: estruture o contexto

```javascript
// ❌ Ruim: texto sem estrutura
const context = `
Analisou 47 arquivos antes e encontrou 23 problemas.
O arquivo atual é src/utils.js, 350 linhas.
A configuração exige verificar injeção de SQL e XSS.
`;

// ✓ Bom: um objeto estruturado
const context = {
  progress: { filesAnalyzed: 47, issuesFound: 23 },
  currentFile: { path: 'src/utils.js', lines: 350 },
  checkTypes: ['sql_injection', 'xss']
};
```

**Por quê?** Contexto estruturado é mais fácil de o agente entender e mais fácil de você depurar.

### Princípio 3: contexto acumulado vs. contexto reiniciado

**Contexto acumulado:** o resultado de cada passo é adicionado ao contexto, que só cresce.

```javascript
let context = { task: 'refatorar a base de código' };

for (const file of files) {
  const result = await agent({ task: 'analisar', context });
  context.results = context.results || [];
  context.results.push(result);  // acumula
}

// No fim, o contexto guarda o resultado de cada arquivo, o que pode ficar enorme
```

**Contexto reiniciado:** cada passo limpa o contexto e mantém apenas o necessário.

```javascript
const allResults = [];

for (const file of files) {
  const context = {
    file,
    guidelines: config.guidelines,
    exampleIssues: allResults.slice(-3)  // apenas os 3 últimos
  };
  
  const result = await agent({ task: 'analisar', context });
  allResults.push(result);  // vive no estado do fluxo de trabalho, não no contexto
}
```

**Qual escolher:** use contexto reiniciado na maior parte do tempo, para evitar a explosão do contexto. Use contexto acumulado apenas quando passos posteriores realmente precisarem de todos os resultados anteriores (como um passo final de resumo).[^S14]

## Observabilidade do estado

**Um bom fluxo de trabalho deve conseguir responder a estas perguntas:**

- Em que fase ele está agora?
- Quanto já foi feito? Quanto falta?
- Quantos erros ele encontrou?
- Quando é esperado que termine?

### Implementando o acompanhamento de progresso

```javascript
class ObservableWorkflow {
  constructor(name, totalSteps) {
    this.state = {
      name,
      totalSteps,
      currentStep: 0,
      phase: 'init',
      startTime: Date.now(),
      errors: [],
      results: []
    };
  }
  
  async executeStep(stepName, fn) {
    this.state.currentStep++;
    this.state.phase = stepName;
    
    console.log(`[${this.state.name}] 
                 passo ${this.state.currentStep}/${this.state.totalSteps}: 
                 ${stepName}`);
    
    const stepStart = Date.now();
    
    try {
      const result = await fn();
      this.state.results.push({ stepName, result, duration: Date.now() - stepStart });
      return result;
    } catch (error) {
      this.state.errors.push({ stepName, error: error.message });
      throw error;
    }
  }
  
  getStatus() {
    const progress = (this.state.currentStep / this.state.totalSteps) * 100;
    const elapsed = Date.now() - this.state.startTime;
    const avgStepTime = elapsed / this.state.currentStep;
    const remainingSteps = this.state.totalSteps - this.state.currentStep;
    const estimatedRemaining = avgStepTime * remainingSteps;
    
    return {
      progress: `${progress.toFixed(1)}%`,
      currentPhase: this.state.phase,
      elapsed: `${(elapsed / 1000).toFixed(1)}s`,
      estimatedRemaining: `${(estimatedRemaining / 1000).toFixed(1)}s`,
      errors: this.state.errors.length
    };
  }
}

// Uso
async function myWorkflow() {
  const wf = new ObservableWorkflow('migração de dados', 4);
  
  const data = await wf.executeStep('ler dados de origem', async () => {
    return await readSourceData();
  });
  
  const transformed = await wf.executeStep('transformar formato', async () => {
    return await transformData(data);
  });
  
  await wf.executeStep('escrever no banco de dados de destino', async () => {
    return await writeToTarget(transformed);
  });
  
  await wf.executeStep('verificar', async () => {
    return await validateMigration();
  });
  
  console.log('Status final:', wf.getStatus());
}
```

<!-- exercises -->


## 💻 Exercícios

### Nível 1: Escolha um padrão de gerenciamento de estado

Para os três fluxos de trabalho abaixo, escolha o padrão correto de gerenciamento de estado (variáveis de script, checkpoint, armazenamento externo) e explique por quê:

**Fluxo de trabalho A:** comprimir em lote 20 imagens, 5 segundos cada, 100 segundos no total

**Fluxo de trabalho B:** treinar um modelo de machine learning, 50 épocas de 10 minutos cada, 500 minutos no total (8 horas)

**Fluxo de trabalho C:** revisar 100 PRs, cada um precisando de aprovação humana antes do merge, e o processo todo pode levar vários dias

<!-- rubric -->
Escolhas corretas de padrão (A: variáveis de script, B: checkpoint, C: armazenamento externo); raciocínio sólido (levando em conta duração, recuperabilidade e se é necessária participação humana)

<!-- answer -->
Fluxo de trabalho A: variáveis de script. A coisa toda leva só 100 segundos — muito curto —, então mesmo uma reexecução completa depois de uma queda custa pouco, e não se justifica um gerenciamento de estado elaborado. Fluxo de trabalho B: checkpoint. 8 horas é muito tempo, e recomeçar do zero depois de uma queda é caro demais, então você deveria salvar um checkpoint a cada poucas épocas. Mas o treinamento é contínuo — sem trabalho entre processos e sem espera por uma pessoa —, então checkpoints bastam. Fluxo de trabalho C: armazenamento externo. O processo leva dias, envolve aprovação humana, e o fluxo de trabalho pausa e retoma em outro momento ou em outro processo, então você precisa persistir o estado externamente (por exemplo, em um banco de dados) para permitir consultar o progresso e retomar a qualquer momento.

<!-- hint -->
Considere três perguntas: (1) A duração total se mede em minutos, horas ou dias? (2) Quão cara é uma reexecução depois de uma queda? (3) É preciso pausar e retomar depois?

<!-- hint -->
Variáveis de script servem para tarefas rápidas (< 10 minutos). Checkpoint serve para tarefas caras (10 minutos a algumas horas). Armazenamento externo serve para tarefas de longa duração (> algumas horas) ou tarefas que precisam de participação humana.

### Nível 2: Projete uma estrutura de estado

Projete o objeto de estado para um fluxo de trabalho de “deploy de múltiplos serviços”. O fluxo de trabalho precisa: (1) construir imagens Docker para 5 serviços (2) enviá-las para um registro de imagens (3) fazer deploy no ambiente de teste um a um (4) rodar testes de integração (5) se os testes passarem, fazer deploy em produção.

**Requisitos:**
- Projete um objeto JSON que represente o estado do fluxo de trabalho
- Inclua: fase atual, status por serviço, informações de erro, timestamps
- Explique onde os checkpoints devem ser salvos

<!-- rubric -->
Estrutura de estado sólida (inclui um marcador de fase, uma lista de serviços com o status de cada um, um array de erros e informações de tempo); o status de cada serviço carrega informação suficiente (por exemplo, status da build, ID da imagem, status do deploy); identifica corretamente os locais dos checkpoints (pelo menos depois das fases 2 e 4, e antes do deploy em produção)

<!-- answer -->
```json
{
  "workflowId": "deploy-2026-08-25-001",
  "phase": "production_deployment",
  "phases": ["build", "push", "test_deploy", "integration_test", "prod_deploy"],
  "services": [
    {
      "name": "api-gateway",
      "buildStatus": "completed",
      "imageId": "sha256:abc123...",
      "testDeployStatus": "completed",
      "prodDeployStatus": "in_progress"
    }
    // ... os outros 4 serviços
  ],
  "integrationTestResult": { "passed": true, "duration": 120 },
  "errors": [],
  "timestamps": {
    "started": 1724572800000,
    "buildCompleted": 1724573100000,
    "pushCompleted": 1724573200000,
    "testDeployCompleted": 1724573500000,
    "integrationTestCompleted": 1724573620000
  }
}
```
Locais dos checkpoints: (1) depois que a fase 2 (push) termina — construir e enviar são operações caras, então evite reexecutá-las (2) depois que a fase 4 (integration_test) termina — passar nos testes é pré-condição para o deploy em produção, e os próprios testes podem falhar e precisar de nova execução depois de uma correção (3) antes de cada serviço ir para produção — permite a recuperação depois de uma falha parcial.

<!-- hint -->
O estado deve conseguir responder: em que fase está o fluxo de trabalho? Em que estado está cada serviço (construindo / construído / implantado / falhou)? Se quebrar, de onde ele retoma?

<!-- hint -->
O status de cada serviço é independente (a falha de build de um serviço não muda o status de outro), então cada serviço deve ter seus próprios campos de status. Os checkpoints pertencem a pontos depois de operações caras e antes de operações irreversíveis (o deploy em produção).

<!-- /exercises -->

---

**Próxima lição:** [Lição 5: Tratamento de erros e estratégias de retentativa](./05-error-handling-retry.md) — aprenda a fazer um fluxo de trabalho se recuperar com elegância em caso de falha, em vez de quebrar por completo
