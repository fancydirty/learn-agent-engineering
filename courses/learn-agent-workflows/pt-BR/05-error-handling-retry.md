# Lição 5: Tratamento de erros e estratégias de retentativa

> Objetivos de aprendizado:
> - Diferenciar erros transitórios de erros permanentes
> - Dominar estratégias de retentativa e algoritmos de backoff
> - Aprender a projetar ações compensatórias e mecanismos de rollback
>
> Pré-requisitos: [Lição 4: Gerenciamento de estado e passagem de contexto](./04-state-and-context.md) | Próxima: [Lição 6 >>](./06-real-world-workflows.md)

## Erros são a norma em fluxos de trabalho

Seu fluxo de trabalho roda perfeitamente dez vezes. Na décima primeira, no passo 8, a API retorna um 503. O fluxo de trabalho quebra.

Então você adiciona um `try-catch`, captura o erro, registra em log e segue em frente. Na décima segunda execução, a conexão com o banco de dados expira. O fluxo de trabalho continua, mas a escrita falhou, e agora seus dados estão inconsistentes.

**Tratamento de erros não é tão simples quanto “adicione um try-catch”.**

Em um fluxo de trabalho, o tratamento de erros precisa responder a três perguntas:[^S7]

1. **Este erro é temporário ou permanente?** (instabilidade de rede vs. permissões ausentes)
2. **Você deve repetir, pular ou abortar?** (uma retentativa pode resolver vs. uma retentativa piora as coisas)
3. **Se abortar, como você limpa os passos que já terminaram?** (reverter o banco de dados vs. enviar um aviso de cancelamento)

Se o passo que falhou é opcional (digamos, enviar uma notificação), pule-o e siga em frente. Não deixar que uma falha não crítica derrube a execução inteira se chama degradação graciosa. Mas se o passo que falhou é crítico, pulá-lo deixa um estado inconsistente, então você deveria abortar.

Sem respostas, seu fluxo de trabalho fica frágil demais (um errinho o derruba) ou perigoso demais (ele ignora erros e continua rodando, deixando estado inconsistente para trás).[^S9]

## Classificando erros: transitórios vs. permanentes

**Erros transitórios** são temporários; uma retentativa pode ter sucesso.[^S8]

**Erros transitórios comuns:**
- Timeouts de rede
- Serviço temporariamente indisponível (503 Service Unavailable)
- Limitação de taxa (429 Too Many Requests)
- Pool de conexões do banco de dados esgotado
- Conflitos temporários de lock

**O que eles têm em comum:** costumam vir de disputa por recursos, oscilação de rede ou sobrecarga temporária, e esperar um instante antes de repetir tende a funcionar.

**Erros permanentes** não vão ter sucesso em uma retentativa; eles precisam de uma correção de código ou de configuração.[^S9]

**Erros permanentes comuns:**
- Permissões ausentes (401 Unauthorized, 403 Forbidden)
- Recurso não encontrado (404 Not Found)
- Entrada malformada (400 Bad Request)
- Erros de lógica de negócio (saldo insuficiente, estoque zerado)
- Bugs de código (ponteiro nulo, divisão por zero)

**O que eles têm em comum:** vêm de configuração incorreta, bugs de código ou regras de negócio violadas, e repetir só desperdiça recursos.

**Como diferenciá-los:**

```javascript
function classifyError(error) {
  // Verificação do código de status HTTP
  if (error.status === 429) return 'transient';  // limitação de taxa
  if (error.status >= 500) return 'transient';   // erro do lado do servidor
  if (error.status === 404) return 'permanent';  // recurso não encontrado
  if (error.status === 401) return 'permanent';  // problema de permissão
  
  // Verificação do tipo de erro
  if (error.code === 'ETIMEDOUT') return 'transient';    // timeout
  if (error.code === 'ECONNREFUSED') return 'transient'; // conexão recusada
  if (error.code === 'ENOTFOUND') return 'permanent';    // falha de DNS
  
  // Verificação da mensagem de erro
  if (error.message.includes('rate limit')) return 'transient';
  if (error.message.includes('permission denied')) return 'permanent';
  
  // Assume permanente por padrão (estratégia conservadora)
  return 'permanent';
}
```

## Estratégias de retentativa

**Para erros transitórios, repetir é seu primeiro movimento. Mas repetir tem mais nuance do que parece.**[^S8]

### Estratégia 1: retentativa com atraso fixo

```javascript
async function retryWithFixedDelay(fn, maxAttempts = 3, delay = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      
      console.log(`Tentativa ${attempt} falhou, repetindo em ${delay}ms...`);
      await sleep(delay);
    }
  }
}

// Uso
const data = await retryWithFixedDelay(
  () => fetchAPI('/users'),
  3,
  1000
);
```

**O problema:** se os erros vêm de um serviço sobrecarregado, todos os clientes repetindo ao mesmo tempo pioram a sobrecarga (o efeito thundering herd).

### Estratégia 2: backoff exponencial

```javascript
async function retryWithExponentialBackoff(fn, maxAttempts = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`Tentativa ${attempt} falhou, repetindo em ${delay}ms...`);
      await sleep(delay);
    }
  }
}

// Sequência de atrasos: 1s, 2s, 4s, 8s, ...
```

**O benefício:** cada retentativa dobra o intervalo, dando ao serviço mais tempo para se recuperar em vez de martelá-lo.[^S8]

### Estratégia 3: backoff exponencial + jitter

```javascript
async function retryWithBackoffAndJitter(fn, maxAttempts = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      
      const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
      const jitter = Math.random() * exponentialDelay;
      const delay = exponentialDelay + jitter;
      
      console.log(`Tentativa ${attempt} falhou, repetindo em ${delay.toFixed(0)}ms...`);
      await sleep(delay);
    }
  }
}

// Sequência de atrasos (com aleatoriedade): 1.2s, 3.7s, 6.1s, ...
```

**O benefício:** o jitter impede que vários clientes repitam exatamente no mesmo instante, distribuindo a carga.[^S8]

**Esta é a estratégia recomendada para produção.**[^S6]

### Estratégia 4: retentativa seletiva

```javascript
async function retrySelective(fn, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const errorType = classifyError(error);
      
      if (errorType === 'permanent') {
        console.log('Erro permanente, não vou repetir');
        throw error;
      }
      
      if (attempt === maxAttempts) {
        console.log(`Todas as ${maxAttempts} retentativas falharam`);
        throw error;
      }
      
      const delay = 1000 * Math.pow(2, attempt - 1) * (1 + Math.random());
      console.log(`Erro transitório, repetindo em ${delay.toFixed(0)}ms...`);
      await sleep(delay);
    }
  }
}
```

**A ideia central:** repita apenas erros transitórios. Lance erros permanentes imediatamente, para não queimar ciclos com retentativas inúteis.[^S10]

```agentmentor-check
{
  "id": "workflows-zh-05-retry-strategy",
  "label": "Escolha da estratégia de retentativa correta",
  "prompt": "Um fluxo de trabalho precisa chamar uma API externa para buscar dados. A API permite 60 requisições por minuto; acima disso, ela retorna 429, e você precisa esperar 60 segundos para continuar. O fluxo de trabalho precisa chamar a API 100 vezes dentro de um minuto. Como você deve tratar os erros 429?",
  "whyHere": "Você acabou de aprender a classificação de erros (transitório vs. permanente) e as estratégias de retentativa (fixa, backoff exponencial, seletiva). Isto verifica se você consegue olhar um tipo específico de erro (limitação de taxa) e escolher uma forma sensata de tratá-lo, em vez de recorrer ao backoff por reflexo.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Usar backoff exponencial; os atrasos continuam crescendo e no fim vai dar certo",
      "correct": false,
      "feedback": "O backoff serve para sobrecarga temporária, mas uma limitação de taxa tem uma janela de recuperação conhecida (60 segundos). O backoff pode desistir em poucos segundos, ou seus atrasos (1s, 2s, 4s) podem ser curtos demais para atravessar a janela. Pior: o fluxo de trabalho precisa de 100 chamadas contra um teto de 60/min, então nenhuma quantidade de retentativas o conclui dentro de um minuto."
    },
    {
      "id": "b",
      "text": "Dividir o trabalho em lotes de 60 requisições, esperando 60 segundos entre os lotes",
      "correct": true,
      "feedback": "Correto. Um 429 é um erro transitório previsível, com tempo de recuperação conhecido. A melhor jogada é respeitar o limite desde o início: enviar 60 requisições no primeiro lote, esperar 60 segundos e então enviar as 40 restantes. Se você ainda receber um 429, a janela anterior não foi totalmente reiniciada, então espere o valor do cabeçalho Retry-After e tente de novo. Isso é melhor do que repetir às cegas."
    },
    {
      "id": "c",
      "text": "Um 429 é um erro permanente (cota esgotada), então falhe imediatamente e alerte um administrador",
      "correct": false,
      "feedback": "Um 429 é transitório, não permanente. Ele significa que você passou da taxa atual, mas pode continuar depois de esperar. Erros permanentes são coisas como configuração incorreta ou permissões ausentes (401, 403), que uma retentativa não resolve. A limitação de taxa é temporária; você a resolve reduzindo o ritmo das requisições ou esperando a janela reiniciar."
    }
  ]
}
```

## O padrão circuit breaker

**O problema:** se um serviço fica falhando (digamos, um banco de dados que caiu) e cada requisição repete três vezes, você queima recursos à toa e arrasta o fluxo de trabalho inteiro para baixo. E se esse serviço é dependência de outros serviços, a falha se propaga pela cadeia e vira uma falha em cascata.

**Um circuit breaker:** quando a taxa de erro cruza um limiar, ele para temporariamente de chamar o serviço que está falhando e falha rápido em vez disso, evitando desperdício de recursos.[^S7]

### Três estados

```
Closed ──taxa de erro > limiar──→ Open
   ↑                                 ↓
   └──teste bem-sucedido──← Half-Open ←──após timeout
```

**Closed:** funcionando normalmente. As requisições passam, e o breaker acompanha a taxa de erro.

**Open:** o serviço é considerado indisponível. As requisições falham rápido, sem chamá-lo.

**Half-open:** depois de um timeout, algumas requisições de teste passam. Se tiverem sucesso, o breaker volta para closed; caso contrário, ele continua open.

### Implementação

```javascript
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;  // falhas antes de abrir
    this.resetTimeout = options.resetTimeout || 60000;      // tenta recuperar após 60s
    
    this.state = 'closed';
    this.failureCount = 0;
    this.nextAttempt = null;
  }
  
  async execute(fn) {
    // Estado open: falha rápido
    if (this.state === 'open') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker aberto, serviço temporariamente indisponível');
      }
      // Depois do timeout, passa para half-open
      this.state = 'half-open';
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  onSuccess() {
    this.failureCount = 0;
    if (this.state === 'half-open') {
      this.state = 'closed';
      console.log('Circuit breaker recuperado para o estado closed');
    }
  }
  
  onFailure() {
    this.failureCount++;
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      this.nextAttempt = Date.now() + this.resetTimeout;
      console.log(`Circuit breaker aberto, vai tentar de novo em ${this.resetTimeout}ms`);
    }
  }
}

// Uso
const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 30000 });

async function callAPI() {
  return await breaker.execute(async () => {
    return await fetch('/api/data');
  });
}
```

**Quando usar:** chamadas a serviços externos, bancos de dados, sistemas de arquivos e outras dependências que podem falhar em massa.[^S7]

## Ações compensatórias e rollback

**O problema:** o fluxo de trabalho fez três escritas (gravar no banco de dados, enviar um e-mail, atualizar o cache), e o passo 4 falhou. Como você desfaz as três primeiras?[^S9]

### Padrão 1: operações transacionais

```javascript
async function transactionalWorkflow() {
  const tx = await db.beginTransaction();
  
  try {
    await tx.insert('users', userData);
    await tx.update('accounts', accountData);
    await tx.insert('logs', logData);
    
    await tx.commit();
    console.log('Transação confirmada');
  } catch (error) {
    await tx.rollback();
    console.log('Transação revertida');
    throw error;
  }
}
```

**Quando serve:** todas as operações vivem no mesmo banco de dados, e ele suporta transações.

**O limite:** não dá para atravessar sistemas (digamos, banco de dados + sistema de arquivos + chamada de API).

### Padrão 2: ações compensatórias (o padrão Saga)

**A ideia:** defina uma ação compensatória para cada operação e, em caso de falha, execute as compensações para desfazer os passos que já terminaram.[^S6]

```javascript
async function sagaWorkflow() {
  const completed = [];
  
  const steps = [
    {
      name: 'Criar pedido',
      forward: async () => {
        const order = await createOrder(orderData);
        return { orderId: order.id };
      },
      compensate: async (context) => {
        await deleteOrder(context.orderId);
        console.log(`Compensação: pedido ${context.orderId} excluído`);
      }
    },
    {
      name: 'Baixar estoque',
      forward: async (context) => {
        await decrementInventory(orderData.items);
        return context;
      },
      compensate: async (context) => {
        await incrementInventory(orderData.items);
        console.log('Compensação: estoque restaurado');
      }
    },
    {
      name: 'Cobrar pagamento',
      forward: async (context) => {
        await chargePayment(context.orderId, orderData.amount);
        return context;
      },
      compensate: async (context) => {
        await refundPayment(context.orderId);
        console.log(`Compensação: pedido ${context.orderId} reembolsado`);
      }
    },
    {
      name: 'Enviar e-mail de confirmação',
      forward: async (context) => {
        await sendEmail(orderData.email, context.orderId);
        return context;
      },
      compensate: async (context) => {
        await sendEmail(orderData.email, 'Pedido cancelado');
        console.log('Compensação: e-mail de cancelamento enviado');
      }
    }
  ];
  
  let context = {};
  
  try {
    // Executa todos os passos para a frente
    for (const step of steps) {
      console.log(`Executando: ${step.name}`);
      context = await step.forward(context);
      completed.push(step);
    }
    
    console.log('Fluxo de trabalho concluído com sucesso');
    return context;
    
  } catch (error) {
    console.log(`Falhou em: passo ${completed.length + 1}/${steps.length}`);
    
    // Executa as compensações na ordem inversa
    for (let i = completed.length - 1; i >= 0; i--) {
      const step = completed[i];
      try {
        await step.compensate(context);
      } catch (compensateError) {
        console.error(`Compensação falhou: ${step.name}`, compensateError);
        // Uma compensação que falha precisa de uma pessoa
      }
    }
    
    throw error;
  }
}
```

**Pontos centrais:**

1. Cada passo tem um `forward` (a ação) e um `compensate` (o desfazer).
2. Em caso de falha, execute as compensações dos passos concluídos na ordem inversa.
3. Uma compensação pode ela mesma falhar; registre em log e sinalize para uma pessoa.[^S6]

### Padrão 3: design idempotente

**Idempotente:** executar N vezes tem o mesmo efeito que executar uma vez.[^S9]

```javascript
// Não idempotente: execuções repetidas continuam somando
async function incrementCounter(userId) {
  const current = await getCounter(userId);
  await setCounter(userId, current + 1);
}

// Idempotente: execuções repetidas chegam ao mesmo resultado
async function setCounter(userId, value) {
  await db.update('counters', { userId }, { value });
}

// Idempotente: deduplicação com um ID único
async function processOrder(orderId, orderData) {
  // Verifica se já foi processado
  const existing = await db.get('orders', orderId);
  if (existing) {
    console.log(`Pedido ${orderId} já processado, pulando`);
    return existing;
  }
  
  // Primeira passagem
  const result = await createOrder(orderData);
  await db.insert('orders', { id: orderId, ...result });
  return result;
}
```

**O benefício:** se um passo roda duas vezes por causa de uma instabilidade de rede (a primeira tentativa expirou, mas na verdade teve sucesso), a idempotência garante que não haja efeitos colaterais duplicados.[^S9]

## Camadas de tratamento de erros

**Um bom fluxo de trabalho trata erros em três camadas:**

### Camada 1: a operação individual

```javascript
async function callAPIWithRetry(endpoint) {
  return await retryWithBackoffAndJitter(
    async () => {
      const response = await fetch(endpoint);
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return response.json();
    },
    3,
    1000
  );
}
```

### Camada 2: o passo do fluxo de trabalho

```javascript
async function workflowStep(stepName, fn) {
  try {
    console.log(`Iniciando: ${stepName}`);
    const result = await fn();
    console.log(`Concluído: ${stepName}`);
    return result;
  } catch (error) {
    console.error(`Falhou: ${stepName}`, error.message);
    
    // Registra no estado
    workflowState.errors.push({
      step: stepName,
      error: error.message,
      timestamp: Date.now()
    });
    
    throw error;
  }
}
```

Esta camada escreve cada falha em `workflowState.errors` com o nome do passo, a mensagem de erro e o timestamp. Esse é o seu log de erros e, quando estiver depurando, você se apoia nesse registro em vez da sua memória.

### Camada 3: o fluxo de trabalho inteiro

```javascript
async function robustWorkflow() {
  const checkpointFile = '.workflow-checkpoint.json';
  
  try {
    // Carrega o checkpoint
    let state = await loadCheckpoint(checkpointFile) || { phase: 'init' };
    
    // Executa cada fase (com lógica de pular)
    if (state.phase === 'init') {
      state.data = await workflowStep('Coletar dados', collectData);
      state.phase = 'collected';
      await saveCheckpoint(checkpointFile, state);
    }
    
    if (state.phase === 'collected') {
      state.processed = await workflowStep('Processar dados', () => processData(state.data));
      state.phase = 'processed';
      await saveCheckpoint(checkpointFile, state);
    }
    
    if (state.phase === 'processed') {
      await workflowStep('Salvar resultados', () => saveResults(state.processed));
      state.phase = 'completed';
      await saveCheckpoint(checkpointFile, state);
    }
    
    return state;
    
  } catch (error) {
    // Tratamento de erros no nível do fluxo de trabalho
    console.error('Fluxo de trabalho falhou:', error);
    
    // Avisa uma pessoa
    await notifyAdmin({
      workflow: 'robustWorkflow',
      phase: workflowState.phase,
      error: error.message
    });
    
    throw error;
  }
}
```

**Três camadas de proteção:** retentativa na camada da operação, registro na camada do passo, recuperação e notificação na camada do fluxo de trabalho.

<!-- exercises -->


## 💻 Exercícios

### Nível 1: Classifique erros e projete estratégias de retentativa

Projete uma estratégia de tratamento (repetir / falhar rápido / compensar) para cada um destes três erros:

**Erro A:** chamar a API de pagamento retorna um erro `ETIMEDOUT`

**Erro B:** inserir no banco de dados retorna um erro `duplicate key`

**Erro C:** enviar um arquivo para o S3 retorna um erro `403 Forbidden`

**Requisitos:**
- Decida se cada erro é transitório ou permanente
- Explique como tratá-lo (quantas retentativas, qual estratégia, ou falhar rápido)
- Se precisar de retentativa, escreva o trecho de código da retentativa

<!-- rubric -->
Classificação correta (A: transitório, B: permanente, C: permanente); estratégia de tratamento razoável (A: repetir 3x + backoff exponencial, B: verificar se já existe / falhar rápido, C: verificar a configuração de permissões / falhar rápido); o código de retentativa inclui backoff exponencial e jitter

<!-- answer -->
Erro A (ETIMEDOUT): transitório. Um timeout de rede pode ser temporário. Estratégia: repetir 3 vezes com backoff exponencial + jitter (1s, 2-4s, 4-8s). Código: `await retryWithBackoffAndJitter(async () => await callPaymentAPI(data), 3, 1000)`. Erro B (duplicate key): permanente. Um conflito de chave primária significa que o registro já existe, então uma retentativa também falha. Estratégia: verificar se o registro existe; se existir com conteúdo idêntico, tratar como sucesso (idempotência); se o conteúdo for diferente, lançar o erro para que quem chamou possa tratá-lo. Erro C (403 Forbidden): permanente. Um problema de permissão precisa de uma mudança de configuração ou de política IAM. Estratégia: falhar rápido, registrar os detalhes em log (nome do bucket, caminho do arquivo, papel atual) e avisar um administrador para corrigir as permissões.

<!-- hint -->
Timeouts (ETIMEDOUT), conexão recusada e erros 503 costumam ser transitórios. Erros de permissão (401/403), recurso não encontrado (404) e entrada malformada (400) costumam ser permanentes.

<!-- hint -->
duplicate key é um caso especial: se o fluxo de trabalho foi projetado para ser idempotente (deduplicação com um ID único), uma inserção repetida deveria contar como “já feito” em vez de erro.

### Nível 2: Projete ações compensatórias

Um fluxo de trabalho de “cadastro de usuário” tem 4 passos: (1) criar o registro do usuário no banco de dados, (2) criar o diretório do usuário `/users/{userId}/`, (3) enviar um e-mail de boas-vindas, (4) adicionar à lista de e-mails. Se o passo 3 ou 4 falhar, como você reverte os passos anteriores?

**Requisitos:**
- Projete uma ação compensatória para cada passo
- Escreva o pseudocódigo no padrão Saga (forward e compensate)
- Explique quais compensações podem falhar e o que fazer quando isso acontecer

<!-- rubric -->
Compensações razoáveis para cada passo (1: excluir o registro do usuário, 2: excluir o diretório, 3/4: enviar um aviso de cancelamento); o pseudocódigo inclui a execução para a frente e a lógica de compensação inversa; reconhece que compensações também podem falhar (por exemplo, o envio do e-mail falha, permissão insuficiente para excluir o diretório) e explica que essas precisam ser registradas em log e tratadas por uma pessoa

<!-- answer -->
Compensação do passo 1: `deleteUser(userId)` — excluir o registro do banco de dados. Compensação do passo 2: `deleteDirectory(path)` — excluir o diretório do usuário e seu conteúdo. Compensação do passo 3: nenhuma necessária (um envio de e-mail que falha não afeta a consistência dos dados). Compensação do passo 4: `removeFromMailingList(email)` — remover da lista de e-mails. Pseudocódigo omitido (veja o exemplo do curso). Falhas de compensação: (1) excluir o diretório pode falhar por permissões insuficientes -> registrar em uma fila de falhas para limpeza manual; (2) remover da lista de e-mails pode falhar se a API estiver fora do ar -> registrar em uma fila de retentativa e tentar de novo mais tarde; (3) excluir o registro do banco de dados deveria sempre ter sucesso (se falhar, o próprio banco de dados tem um problema e precisa de um alerta urgente). O ponto central: uma compensação que falha não deveria travar o fluxo de trabalho inteiro. Registre as compensações que falharam, siga em frente e, no fim, envie a um administrador um resumo dos itens com falha.

<!-- hint -->
Uma compensação é o “desfazer” de uma ação para a frente: criar -> excluir, escrever -> excluir ou sobrescrever, enviar uma mensagem -> enviar uma mensagem de cancelamento.

<!-- hint -->
Algumas ações não podem ser realmente desfeitas (um e-mail já enviado, um webhook de terceiros já disparado). Nesse caso, a compensação é “avisar as partes afetadas de que a ação foi cancelada”, e não “desfazer a ação em si”.

<!-- /exercises -->

---

**Próxima:** [Lição 6: Fluxos de trabalho do mundo real na prática](./06-real-world-workflows.md) — Junte tudo para construir três fluxos de trabalho de nível de produção: refatoração de código, geração de documentação e automação de testes
