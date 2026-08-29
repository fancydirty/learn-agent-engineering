# 레슨 5: 에러 처리와 재시도 전략

> 학습 목표:
> - 일시적 에러와 영구적 에러 구분하기
> - 재시도 전략과 백오프 알고리즘 익히기
> - 보상 동작과 롤백 메커니즘 설계법 배우기
>
> 전제: [레슨 4: 상태 관리와 컨텍스트 전달](./04-state-and-context.md) | 다음: [레슨 6 >>](./06-real-world-workflows.md)

## 워크플로에서 에러는 일상이다

워크플로가 열 번 완벽하게 돌았습니다. 열한 번째, 8단계에서 API가 503을 반환합니다. 워크플로가 죽습니다.

그래서 `try-catch`를 넣고, 에러를 잡고, 로그를 남기고, 계속 진행하게 만듭니다. 열두 번째 실행에서는 데이터베이스 연결이 타임아웃됩니다. 워크플로는 계속 돌지만 쓰기는 실패했고, 이제 데이터가 어긋나 있습니다.

**에러 처리는 "try-catch를 넣는다"만큼 단순하지 않습니다.**

워크플로에서 에러 처리는 세 가지 질문에 답해야 합니다.[^S7]

1. **이 에러는 일시적인가, 영구적인가?**(네트워크 흔들림 vs 권한 없음)
2. **재시도해야 하나, 건너뛰어야 하나, 중단해야 하나?**(재시도가 해결할 수도 있고, 재시도가 상황을 악화시킬 수도 있다)
3. **중단한다면 이미 끝난 단계는 어떻게 정리하나?**(데이터베이스 롤백 vs 취소 통지 발송)

실패한 단계가 선택적인 것이라면(예를 들어 알림 발송), 건너뛰고 계속 가면 됩니다. 치명적이지 않은 실패가 전체 실행을 무너뜨리지 않게 하는 것을 우아한 성능 저하(graceful degradation)라고 부릅니다. 하지만 실패한 단계가 핵심적인 것이라면, 건너뛸 경우 상태가 어긋난 채로 남으므로 대신 중단해야 합니다.

답이 없으면 워크플로는 너무 약하거나(작은 에러 하나에 통째로 쓰러진다) 너무 위험합니다(에러를 무시하고 계속 돌면서 어긋난 상태를 남긴다).[^S9]

## 에러 분류: 일시적 vs 영구적

**일시적 에러**는 한때의 문제이며, 재시도하면 성공할 수 있습니다.[^S8]

**흔한 일시적 에러:**
- 네트워크 타임아웃
- 서비스 일시 중단(503 Service Unavailable)
- 레이트 리밋(429 Too Many Requests)
- 데이터베이스 커넥션 풀 고갈
- 일시적인 락 충돌

**공통점:** 보통 리소스 경합, 네트워크 변동, 일시적 과부하에서 오며, 잠시 기다렸다가 재시도하면 대체로 통합니다.

**영구적 에러**는 재시도해도 성공하지 않습니다. 코드나 설정을 고쳐야 합니다.[^S9]

**흔한 영구적 에러:**
- 권한 없음(401 Unauthorized, 403 Forbidden)
- 리소스를 찾을 수 없음(404 Not Found)
- 잘못된 형식의 입력(400 Bad Request)
- 비즈니스 로직 에러(잔액 부족, 재고 없음)
- 코드 버그(널 포인터, 0으로 나누기)

**공통점:** 잘못된 설정, 코드 버그, 비즈니스 규칙 위반에서 오며, 재시도는 리소스만 낭비합니다.

**둘을 구분하는 법:**

```javascript
function classifyError(error) {
  // HTTP 상태 코드 검사
  if (error.status === 429) return 'transient';  // 레이트 리밋
  if (error.status >= 500) return 'transient';   // 서버 측 에러
  if (error.status === 404) return 'permanent';  // 리소스 없음
  if (error.status === 401) return 'permanent';  // 권한 문제
  
  // 에러 타입 검사
  if (error.code === 'ETIMEDOUT') return 'transient';    // 타임아웃
  if (error.code === 'ECONNREFUSED') return 'transient'; // 연결 거부
  if (error.code === 'ENOTFOUND') return 'permanent';    // DNS 실패
  
  // 에러 메시지 검사
  if (error.message.includes('rate limit')) return 'transient';
  if (error.message.includes('permission denied')) return 'permanent';
  
  // 기본값은 영구적(보수적 전략)
  return 'permanent';
}
```

## 재시도 전략

**일시적 에러라면 재시도가 첫 수입니다. 하지만 재시도에는 보이는 것보다 많은 것이 걸려 있습니다.**[^S8]

### 전략 1: 고정 지연 재시도

```javascript
async function retryWithFixedDelay(fn, maxAttempts = 3, delay = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      
      console.log(`${attempt}번째 시도 실패, ${delay}ms 후 재시도...`);
      await sleep(delay);
    }
  }
}

// 사용법
const data = await retryWithFixedDelay(
  () => fetchAPI('/users'),
  3,
  1000
);
```

**문제:** 에러의 원인이 과부하된 서비스라면, 모든 클라이언트가 동시에 재시도하면서 과부하가 더 심해집니다(thundering herd 현상).

### 전략 2: 지수 백오프

```javascript
async function retryWithExponentialBackoff(fn, maxAttempts = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`${attempt}번째 시도 실패, ${delay}ms 후 재시도...`);
      await sleep(delay);
    }
  }
}

// 지연 시퀀스: 1초, 2초, 4초, 8초, ...
```

**장점:** 재시도할 때마다 간격이 두 배가 되므로, 서비스를 두들기는 대신 회복할 시간을 더 줍니다.[^S8]

### 전략 3: 지수 백오프 + 지터

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
      
      console.log(`${attempt}번째 시도 실패, ${delay.toFixed(0)}ms 후 재시도...`);
      await sleep(delay);
    }
  }
}

// 지연 시퀀스(무작위성 포함): 1.2초, 3.7초, 6.1초, ...
```

**장점:** 지터는 여러 클라이언트가 정확히 같은 순간에 재시도하는 것을 막아 부하를 흩뜨립니다.[^S8]

**프로덕션에서 권장하는 전략이 이것입니다.**[^S6]

### 전략 4: 선별적 재시도

```javascript
async function retrySelective(fn, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const errorType = classifyError(error);
      
      if (errorType === 'permanent') {
        console.log('영구적 에러, 재시도하지 않음');
        throw error;
      }
      
      if (attempt === maxAttempts) {
        console.log(`${maxAttempts}번의 재시도가 모두 실패`);
        throw error;
      }
      
      const delay = 1000 * Math.pow(2, attempt - 1) * (1 + Math.random());
      console.log(`일시적 에러, ${delay.toFixed(0)}ms 후 재시도...`);
      await sleep(delay);
    }
  }
}
```

**핵심 발상:** 일시적 에러만 재시도합니다. 영구적 에러는 즉시 던져서, 소용없는 재시도에 시간을 태우지 않습니다.[^S10]

```agentmentor-check
{
  "id": "workflows-zh-05-retry-strategy",
  "label": "올바른 재시도 전략 고르기",
  "prompt": "어떤 워크플로가 외부 API를 호출해 데이터를 가져와야 합니다. 이 API는 분당 60회 요청을 허용하고, 그것을 넘으면 429를 반환하며, 계속하려면 60초를 기다려야 합니다. 워크플로는 1분 안에 이 API를 100번 호출해야 합니다. 429 에러를 어떻게 처리해야 할까요?",
  "whyHere": "에러 분류(일시적 vs 영구적)와 재시도 전략(고정, 지수 백오프, 선별적)을 방금 배웠습니다. 여기서는 특정한 에러 타입(레이트 리밋)을 보고 반사적으로 백오프를 꺼내 드는 대신 합리적인 처리 방법을 고를 수 있는지 점검합니다.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "지수 백오프를 쓴다. 지연이 계속 늘어나니 결국 성공할 것이다",
      "correct": false,
      "feedback": "백오프는 일시적 과부하에 맞는 전략이지만, 레이트 리밋에는 알려진 회복 구간(60초)이 있습니다. 백오프는 몇 초 안에 포기해 버릴 수도 있고, 그 지연(1초, 2초, 4초)이 회복 구간을 넘기기에는 너무 짧을 수도 있습니다. 게다가 워크플로는 분당 60회 한도에 대고 100번을 호출해야 하므로, 아무리 재시도해도 1분 안에는 끝나지 않습니다."
    },
    {
      "id": "b",
      "text": "요청 60개씩 배치로 나누고, 배치 사이에 60초를 기다린다",
      "correct": true,
      "feedback": "정답입니다. 429는 회복 시간이 알려진, 예측 가능한 일시적 에러입니다. 가장 좋은 수는 처음부터 한도를 존중하는 것입니다. 첫 배치로 60개를 보내고, 60초를 기다린 다음, 남은 40개를 보냅니다. 그래도 429가 나온다면 이전 구간이 아직 완전히 초기화되지 않은 것이므로, Retry-After 헤더 값만큼 기다렸다가 다시 시도합니다. 맹목적으로 재시도하는 것보다 낫습니다."
    },
    {
      "id": "c",
      "text": "429는 영구적 에러(할당량 소진)이므로 즉시 실패시키고 관리자에게 알린다",
      "correct": false,
      "feedback": "429는 영구적이 아니라 일시적입니다. 현재 속도를 초과했다는 뜻이지만, 기다리면 계속할 수 있습니다. 영구적 에러란 잘못된 설정이나 권한 없음(401, 403)처럼 재시도로는 고쳐지지 않는 것들입니다. 레이트 리밋은 일시적인 것이고, 요청 속도를 늦추거나 구간이 초기화되기를 기다려서 해결합니다."
    }
  ]
}
```

## 서킷 브레이커 패턴

**문제:** 어떤 서비스가 계속 실패하는데(예를 들어 죽어 버린 데이터베이스) 모든 요청이 세 번씩 재시도한다면, 아무 소득 없이 리소스만 태우고 워크플로 전체를 끌어내립니다. 게다가 그 서비스가 다른 서비스의 의존 대상이라면, 실패는 사슬을 타고 번져 연쇄 장애가 됩니다.

**서킷 브레이커:** 에러율이 임계치를 넘으면 실패하는 서비스 호출을 일시적으로 멈추고 빠르게 실패시켜, 리소스 낭비를 막습니다.[^S7]

### 세 가지 상태

```
Closed ──에러율 > 임계치──→ Open
   ↑                        ↓
   └──테스트 성공──← Half-Open ←──타임아웃 후
```

**Closed:** 정상 동작. 요청이 통과하고, 브레이커는 에러율을 추적합니다.

**Open:** 서비스를 사용할 수 없다고 봅니다. 요청은 호출 없이 즉시 실패합니다.

**Half-open:** 타임아웃이 지나면 시험 삼아 몇 건의 요청을 통과시킵니다. 성공하면 브레이커는 closed로 돌아가고, 그렇지 않으면 open으로 남습니다.

### 구현

```javascript
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;  // 열기까지 허용할 실패 횟수
    this.resetTimeout = options.resetTimeout || 60000;      // 60초 뒤 복구 시도
    
    this.state = 'closed';
    this.failureCount = 0;
    this.nextAttempt = null;
  }
  
  async execute(fn) {
    // open 상태: 빠르게 실패
    if (this.state === 'open') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('서킷 브레이커 열림, 서비스를 일시적으로 사용할 수 없습니다');
      }
      // 타임아웃이 지나면 half-open으로 전환
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
      console.log('서킷 브레이커가 closed 상태로 복구됨');
    }
  }
  
  onFailure() {
    this.failureCount++;
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      this.nextAttempt = Date.now() + this.resetTimeout;
      console.log(`서킷 브레이커 열림, ${this.resetTimeout}ms 후 재시도`);
    }
  }
}

// 사용법
const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 30000 });

async function callAPI() {
  return await breaker.execute(async () => {
    return await fetch('/api/data');
  });
}
```

**언제 쓰나:** 외부 서비스, 데이터베이스, 파일 시스템처럼 한꺼번에 실패할 수 있는 의존 대상을 호출할 때.[^S7]

## 보상 동작과 롤백

**문제:** 워크플로가 쓰기 작업을 세 번 했는데(데이터베이스에 쓰기, 이메일 발송, 캐시 갱신) 4단계가 실패했습니다. 앞의 셋을 어떻게 되돌릴까요?[^S9]

### 패턴 1: 트랜잭션 작업

```javascript
async function transactionalWorkflow() {
  const tx = await db.beginTransaction();
  
  try {
    await tx.insert('users', userData);
    await tx.update('accounts', accountData);
    await tx.insert('logs', logData);
    
    await tx.commit();
    console.log('트랜잭션 커밋됨');
  } catch (error) {
    await tx.rollback();
    console.log('트랜잭션 롤백됨');
    throw error;
  }
}
```

**언제 맞나:** 모든 작업이 트랜잭션을 지원하는 같은 데이터베이스 안에 있을 때.

**한계:** 시스템을 넘어설 수 없습니다(예를 들어 데이터베이스 + 파일 시스템 + API 호출).

### 패턴 2: 보상 동작(Saga 패턴)

**발상:** 각 작업마다 보상 동작을 정의해 두고, 실패하면 보상을 실행해 이미 끝난 단계를 되돌립니다.[^S6]

```javascript
async function sagaWorkflow() {
  const completed = [];
  
  const steps = [
    {
      name: '주문 생성',
      forward: async () => {
        const order = await createOrder(orderData);
        return { orderId: order.id };
      },
      compensate: async (context) => {
        await deleteOrder(context.orderId);
        console.log(`보상: 주문 ${context.orderId} 삭제`);
      }
    },
    {
      name: '재고 차감',
      forward: async (context) => {
        await decrementInventory(orderData.items);
        return context;
      },
      compensate: async (context) => {
        await incrementInventory(orderData.items);
        console.log('보상: 재고 복원');
      }
    },
    {
      name: '결제 청구',
      forward: async (context) => {
        await chargePayment(context.orderId, orderData.amount);
        return context;
      },
      compensate: async (context) => {
        await refundPayment(context.orderId);
        console.log(`보상: 주문 ${context.orderId} 환불`);
      }
    },
    {
      name: '확인 이메일 발송',
      forward: async (context) => {
        await sendEmail(orderData.email, context.orderId);
        return context;
      },
      compensate: async (context) => {
        await sendEmail(orderData.email, '주문이 취소되었습니다');
        console.log('보상: 취소 이메일 발송');
      }
    }
  ];
  
  let context = {};
  
  try {
    // 모든 단계를 정방향으로 실행
    for (const step of steps) {
      console.log(`실행 중: ${step.name}`);
      context = await step.forward(context);
      completed.push(step);
    }
    
    console.log('워크플로가 성공적으로 완료됨');
    return context;
    
  } catch (error) {
    console.log(`실패 지점: ${completed.length + 1}/${steps.length}단계`);
    
    // 역순으로 보상 실행
    for (let i = completed.length - 1; i >= 0; i--) {
      const step = completed[i];
      try {
        await step.compensate(context);
      } catch (compensateError) {
        console.error(`보상 실패: ${step.name}`, compensateError);
        // 보상이 실패하면 사람이 개입해야 한다
      }
    }
    
    throw error;
  }
}
```

**핵심:**

1. 모든 단계에 `forward`(수행할 동작)와 `compensate`(되돌리기)가 있습니다.
2. 실패하면 완료된 단계의 보상을 역순으로 실행합니다.
3. 보상 자체도 실패할 수 있습니다. 로그를 남기고 사람이 볼 수 있게 표시합니다.[^S6]

### 패턴 3: 멱등 설계

**멱등:** N번 실행해도 한 번 실행한 것과 같은 효과를 냅니다.[^S9]

```javascript
// 멱등하지 않음: 반복 실행할수록 계속 더해진다
async function incrementCounter(userId) {
  const current = await getCounter(userId);
  await setCounter(userId, current + 1);
}

// 멱등함: 반복 실행해도 같은 결과에 도달한다
async function setCounter(userId, value) {
  await db.update('counters', { userId }, { value });
}

// 멱등함: 고유 ID로 중복 제거
async function processOrder(orderId, orderData) {
  // 이미 처리되었는지 확인
  const existing = await db.get('orders', orderId);
  if (existing) {
    console.log(`주문 ${orderId}은 이미 처리됨, 건너뜀`);
    return existing;
  }
  
  // 처음 처리하는 경우
  const result = await createOrder(orderData);
  await db.insert('orders', { id: orderId, ...result });
  return result;
}
```

**장점:** 네트워크가 한 번 딸꾹질해서 어떤 단계가 두 번 실행되더라도(첫 시도가 타임아웃됐지만 실제로는 성공했던 경우), 멱등성은 부수 효과가 중복되지 않도록 보장합니다.[^S9]

## 에러 처리의 계층

**좋은 워크플로는 세 계층에서 에러를 처리합니다.**

### 계층 1: 개별 작업

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

### 계층 2: 워크플로 단계

```javascript
async function workflowStep(stepName, fn) {
  try {
    console.log(`시작: ${stepName}`);
    const result = await fn();
    console.log(`완료: ${stepName}`);
    return result;
  } catch (error) {
    console.error(`실패: ${stepName}`, error.message);
    
    // 상태에 기록
    workflowState.errors.push({
      step: stepName,
      error: error.message,
      timestamp: Date.now()
    });
    
    throw error;
  }
}
```

이 계층은 모든 실패를 단계 이름, 에러 메시지, 타임스탬프와 함께 `workflowState.errors`에 적어 둡니다. 그것이 여러분의 에러 로그이고, 디버깅할 때는 기억이 아니라 이 기록에 기댑니다.

### 계층 3: 워크플로 전체

```javascript
async function robustWorkflow() {
  const checkpointFile = '.workflow-checkpoint.json';
  
  try {
    // 체크포인트 로드
    let state = await loadCheckpoint(checkpointFile) || { phase: 'init' };
    
    // 각 단계 실행(건너뛰기 로직 포함)
    if (state.phase === 'init') {
      state.data = await workflowStep('데이터 수집', collectData);
      state.phase = 'collected';
      await saveCheckpoint(checkpointFile, state);
    }
    
    if (state.phase === 'collected') {
      state.processed = await workflowStep('데이터 처리', () => processData(state.data));
      state.phase = 'processed';
      await saveCheckpoint(checkpointFile, state);
    }
    
    if (state.phase === 'processed') {
      await workflowStep('결과 저장', () => saveResults(state.processed));
      state.phase = 'completed';
      await saveCheckpoint(checkpointFile, state);
    }
    
    return state;
    
  } catch (error) {
    // 워크플로 수준 에러 처리
    console.error('워크플로 실패:', error);
    
    // 사람에게 알림
    await notifyAdmin({
      workflow: 'robustWorkflow',
      phase: workflowState.phase,
      error: error.message
    });
    
    throw error;
  }
}
```

**세 겹의 방어:** 작업 계층에서 재시도하고, 단계 계층에서 기록하고, 워크플로 계층에서 복구하고 알립니다.

<!-- exercises -->


## 💻 연습

### 레벨 1: 에러를 분류하고 재시도 전략 설계하기

아래 세 에러 각각에 대해 처리 전략(재시도 / 빠른 실패 / 보상)을 설계하세요.

**에러 A:** 결제 API를 호출했더니 `ETIMEDOUT` 에러가 반환됨

**에러 B:** 데이터베이스에 삽입했더니 `duplicate key` 에러가 반환됨

**에러 C:** S3에 파일을 업로드했더니 `403 Forbidden` 에러가 반환됨

**요구 사항:**
- 각 에러가 일시적인지 영구적인지 판단
- 어떻게 처리할지 설명(몇 번 재시도할지, 어떤 전략을 쓸지, 아니면 빠르게 실패할지)
- 재시도가 필요하다면 재시도 코드 조각 작성

<!-- rubric -->
분류가 정확함(A: 일시적, B: 영구적, C: 영구적). 처리 전략이 합리적임(A: 3회 재시도 + 지수 백오프, B: 이미 존재하는지 확인 / 빠른 실패, C: 권한 설정 확인 / 빠른 실패). 재시도 코드에 지수 백오프와 지터가 포함됨

<!-- answer -->
에러 A(ETIMEDOUT): 일시적입니다. 네트워크 타임아웃은 한때의 문제일 수 있습니다. 전략: 지수 백오프 + 지터로 3회 재시도(1초, 2~4초, 4~8초). 코드: `await retryWithBackoffAndJitter(async () => await callPaymentAPI(data), 3, 1000)`. 에러 B(duplicate key): 영구적입니다. 기본 키 충돌은 레코드가 이미 존재한다는 뜻이므로 재시도해도 실패합니다. 전략: 레코드가 존재하는지 확인하고, 내용이 동일한 상태로 존재한다면 성공으로 취급합니다(멱등성). 내용이 다르다면 던져서 호출자가 처리하게 합니다. 에러 C(403 Forbidden): 영구적입니다. 권한 문제는 설정이나 IAM 정책을 바꿔야 합니다. 전략: 빠르게 실패시키고, 상세 정보(버킷 이름, 파일 경로, 현재 역할)를 로그에 남기고, 관리자에게 알려 권한을 고치게 합니다.

<!-- hint -->
타임아웃(ETIMEDOUT), 연결 거부, 503 에러는 보통 일시적입니다. 권한 에러(401/403), 리소스 없음(404), 잘못된 형식의 입력(400)은 보통 영구적입니다.

<!-- hint -->
duplicate key는 특수한 경우입니다. 워크플로가 멱등하게 설계되어 있다면(고유 ID로 중복 제거), 반복된 삽입은 에러가 아니라 "이미 완료됨"으로 세어야 합니다.

### 레벨 2: 보상 동작 설계하기

"사용자 등록" 워크플로에 4단계가 있습니다. (1) 데이터베이스에 사용자 레코드 생성 (2) 사용자 디렉터리 `/users/{userId}/` 생성 (3) 환영 이메일 발송 (4) 메일링 리스트에 추가. 3단계나 4단계가 실패하면 앞선 단계들을 어떻게 롤백할까요?

**요구 사항:**
- 각 단계의 보상 동작 설계
- Saga 패턴 의사 코드 작성(forward와 compensate)
- 어떤 보상이 실패할 수 있는지, 실패하면 어떻게 할지 설명

<!-- rubric -->
모든 단계에 합리적인 보상이 있음(1: 사용자 레코드 삭제, 2: 디렉터리 삭제, 3/4: 취소 통지 발송). 의사 코드에 정방향 실행과 역순 보상 로직이 포함됨. 보상도 실패할 수 있음을 인지하고(예: 이메일 발송 실패, 디렉터리 삭제 권한 부족) 이런 경우 로그를 남기고 사람이 처리해야 한다고 설명함

<!-- answer -->
1단계 보상: `deleteUser(userId)` — 데이터베이스에서 레코드를 삭제합니다. 2단계 보상: `deleteDirectory(path)` — 사용자 디렉터리와 그 내용을 삭제합니다. 3단계 보상: 필요 없습니다(이메일 발송 실패는 데이터 정합성에 영향을 주지 않습니다). 4단계 보상: `removeFromMailingList(email)` — 메일링 리스트에서 제거합니다. 의사 코드는 생략합니다(본문 예시 참고). 보상 실패: (1) 디렉터리 삭제는 권한 부족으로 실패할 수 있습니다 -> 실패 큐에 기록해 수동으로 정리합니다. (2) 메일링 리스트 제거는 API가 죽어 있으면 실패할 수 있습니다 -> 재시도 큐에 기록해 나중에 다시 시도합니다. (3) 데이터베이스 레코드 삭제는 항상 성공해야 합니다(실패한다면 데이터베이스 자체에 문제가 있는 것이고 긴급 알림이 필요합니다). 핵심: 보상이 실패했다고 워크플로 전체가 멈춰서는 안 됩니다. 실패한 보상을 기록하고 계속 진행한 다음, 마지막에 관리자에게 실패 항목 요약을 보냅니다.

<!-- hint -->
보상은 정방향 동작의 "되돌리기"입니다. 생성 -> 삭제, 쓰기 -> 삭제 또는 덮어쓰기, 메시지 발송 -> 취소 메시지 발송.

<!-- hint -->
어떤 동작은 진짜로 되돌릴 수 없습니다(이미 나간 이메일, 이미 발화된 서드파티 웹훅). 그런 경우 보상은 "동작 자체를 되돌리기"가 아니라 "영향을 받은 쪽에 취소되었음을 알리기"가 됩니다.

<!-- /exercises -->

---

**다음:** [레슨 6: 실전 워크플로 사례](./06-real-world-workflows.md) — 지금까지의 것을 모두 합쳐 프로덕션 수준의 워크플로 세 개를 만듭니다. 코드 리팩터링, 문서 생성, 테스트 자동화
