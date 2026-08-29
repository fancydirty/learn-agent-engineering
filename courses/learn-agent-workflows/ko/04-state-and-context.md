# 레슨 4: 상태 관리와 컨텍스트 전달

> 학습 목표:
> - 워크플로 상태와 에이전트 컨텍스트 구분하기
> - 세 가지 상태 관리 패턴 익히기
> - 체크포인트와 복구 이해하기
>
> 전제: [레슨 3: 복잡한 작업을 워크플로로 분해하기](./03-task-decomposition.md) | 다음: [레슨 5 >>](./05-error-handling-retry.md)

## 상태 관리가 워크플로의 심장인 이유

완벽한 워크플로를 설계합니다. 10단계, 깔끔한 의존 관계. 그런데 8단계에서 서버가 재시작됩니다. 워크플로가 죽습니다.

다시 돌릴까요? 그러면 앞선 7단계의 작업이 — 어쩌면 30분어치가 — 그대로 버려집니다.

**그것이 상태 관리가 없을 때 치르는 대가입니다.**

상태 관리는 세 가지 문제를 풉니다.[^S12]

1. **단계 간 데이터 전달**: 3단계는 1단계와 2단계의 결과를 어떻게 받을까요?
2. **진행 상황 추적**: 워크플로는 어디까지 왔을까요? 얼마나 남았을까요?
3. **실패 복구**: 죽고 난 뒤 처음부터 다시 시작하는 대신, 멈춘 지점부터 이어서 실행합니다.

상태 관리가 없으면 에이전트는 대화 이력을 통해서만 정보를 전달할 수 있습니다. 대화 이력은 넘치고, 유실되고, 에이전트가 잊어버립니다.

상태 관리가 있으면 워크플로는 분명한 "기억"을 갖습니다. 영속적이고, 조회할 수 있고, 복구할 수 있는 기억입니다.[^S11]

## 상태 vs. 컨텍스트 vs. 메모리

이 세 단어는 뒤섞이기 쉬우니 먼저 못을 박아 둡시다.[^S12]

**상태(state)**
- 현재 작업에 관한 모든 정보: 지금 몇 번째 단계인지, 각 단계의 결과가 무엇인지, 다음에 무엇을 할지
- 스냅숏입니다. 워크플로가 이 순간 알고 있는 전부
- 저장 위치: 스크립트 변수, 데이터베이스, 파일

**컨텍스트(context)**
- 에이전트 호출 한 번에 넘기는 정보
- 입력입니다. 이 에이전트가 자기 일을 하기 위해 알아야 하는 것
- 상태에서 선별해 뽑아낸 것: 상태 전부가 에이전트로 가지 않고, 관련된 부분만 갑니다

**메모리(memory)**
- 과거에서 얻은 교훈: 전에 무엇을 했는지, 어떤 문제가 있었는지, 해법은 무엇이었는지
- 이력입니다. 작업과 세션을 가로지르는 장기 지식
- 이 레슨의 범위 밖입니다(장기 기억은 그 자체로 어려운 주제입니다)

**예시:**

```javascript
// 상태: 워크플로가 알고 있는 모든 것
const workflowState = {
  phase: 'testing',
  filesProcessed: 47,
  totalFiles: 100,
  issues: [/* 앞선 단계에서 찾은 모든 이슈 */],
  currentBatch: [/* 지금 처리 중인 파일들 */]
};

// 컨텍스트: 이 에이전트를 위한 정보(상태에서 뽑아냄)
const agentContext = {
  file: workflowState.currentBatch[0],
  previousIssues: workflowState.issues.filter(i => i.severity === 'high')
};

// 에이전트 호출
const result = await agent({
  task: '파일 테스트',
  context: agentContext  // 상태 전체가 아니라 관련 정보만
});

// 상태 갱신
workflowState.filesProcessed++;
workflowState.issues.push(...result.newIssues);
```

**핵심 원칙: 상태는 전역이고, 컨텍스트는 지역입니다.**[^S15]

## 상태 패턴 1: 스크립트 변수(인메모리 상태)

**언제 쓰나:** 프로세스나 머신을 넘어갈 필요가 없는 짧은 워크플로(10분 미만).

**장점:** 단순하고, 빠르고, 외부 의존이 없습니다.

**단점:** 프로세스가 죽으면 상태가 사라지고, 복구할 방법이 없습니다.

### 기본 패턴

```javascript
async function simpleWorkflow(files) {
  // 상태는 그냥 평범한 JavaScript 변수
  let processed = 0;
  let results = [];
  let errors = [];
  
  for (const file of files) {
    try {
      const result = await processFile(file);
      results.push(result);
      processed++;
      console.log(`진행: ${processed}/${files.length}`);
    } catch (error) {
      errors.push({ file, error });
    }
  }
  
  return { results, errors, total: files.length };
}
```

**상태는 어디에 있나요?** 함수의 지역 변수(`processed`, `results`, `errors`) 안에 있습니다.

**프로세스가 죽으면요?** 상태가 전부 사라지고, 맨 처음부터 다시 시작합니다.

### 더 나은 방법: 구조화된 상태 객체

```javascript
async function betterWorkflow(files) {
  // 상태를 객체로 정리 — 더 명확하다
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

**무엇이 좋아지나:** 상태에 분명한 구조가 생기고, 다른 함수로 넘기기 쉬워지며, 직렬화하기도 쉬워집니다(영속화가 필요할 때).

## 상태 패턴 2: 체크포인트

**언제 쓰나:** 비용이 큰 작업 뒤에 진행 상황을 저장해야 하는 중간 길이의 워크플로(10~60분).

**장점:** 죽은 뒤에 가장 최근 체크포인트부터 이어서 실행할 수 있어, 작업을 다시 하지 않아도 됩니다.

**단점:** 체크포인트 위치와 복구 로직을 직접 설계해야 합니다.[^S12]

### 체크포인트 위치 고르기

```javascript
async function workflowWithCheckpoints(tasks) {
  const checkpointFile = '.workflow-state.json';
  
  // 이전 상태 복원 시도
  let state = await loadCheckpoint(checkpointFile) || {
    completed: [],
    pending: tasks,
    phase: 'processing'
  };
  
  console.log(`이어서 실행: ${state.completed.length}/${tasks.length} 완료`);
  
  while (state.pending.length > 0) {
    const task = state.pending.shift();
    
    // 작업 실행
    const result = await executeTask(task);
    state.completed.push({ task, result });
    
    // 체크포인트: 10개 작업마다 저장
    if (state.completed.length % 10 === 0) {
      await saveCheckpoint(checkpointFile, state);
      console.log(`체크포인트: ${state.completed.length}개 작업 완료`);
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
    return null;  // 파일이 없으면 처음부터 시작
  }
}
```

**체크포인트 전략:**

- **주기적 체크포인트**: N개 작업마다 또는 M분마다 저장
- **단계 체크포인트**: 주요 단계가 끝날 때마다 저장(예: "분석 단계 완료")
- **중요한 작업 직전**: 되돌릴 수 없는 작업 전에 저장(예: 배포, 삭제)

```agentmentor-check
{
  "id": "workflows-zh-04-checkpoint-placement",
  "label": "체크포인트 위치가 적절한지 판단하기",
  "prompt": "데이터 마이그레이션 워크플로에 4개 단계가 있습니다. (1) 원본 데이터베이스에서 1000건 읽기(5분) (2) 데이터 형식 변환(10분) (3) 대상 데이터베이스에 쓰기(20분) (4) 데이터 정합성 검증(5분). 체크포인트를 단 1개만 둘 수 있다면, 어느 단계 뒤에 두어야 할까요?",
  "whyHere": "체크포인트 개념과 전략(주기적, 단계별, 중요한 작업 직전)을 방금 배웠습니다. 여기서는 작업의 특성(시간 비용, 되돌릴 수 있는지)에서 최적의 체크포인트 위치를 골라낼 수 있는지 점검합니다",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "1단계 뒤. 첫 번째 단계이기 때문에",
      "correct": false,
      "feedback": "1단계는 5분밖에 걸리지 않으므로, 죽은 뒤에 다시 돌려도 비용이 거의 없습니다. 체크포인트는 길거나 되돌릴 수 없는 작업 뒤에 두는 것이지, 단순히 순서상 첫 단계에 두는 것이 아닙니다."
    },
    {
      "id": "b",
      "text": "2단계 뒤. 가장 비용이 크고, 쓰기 작업 직전이기 때문에",
      "correct": true,
      "feedback": "정답입니다. 2단계는 순수 계산으로는 가장 긴 단계(10분)이고, 3단계는 되돌릴 수 없는 쓰기입니다. 2단계 뒤의 체크포인트는 비용이 큰 변환을 다시 돌리지 않게 해 주는 동시에, 되돌릴 수 없는 쓰기 직전의 상태를 저장해 둡니다. 3단계가 실패하면 체크포인트부터 이어서 실행해 문제를 고치고 다시 쓰면 됩니다. 다시 읽고 다시 변환할 필요가 없습니다."
    },
    {
      "id": "c",
      "text": "3단계 뒤. 쓰기가 끝났기 때문에",
      "correct": false,
      "feedback": "3단계 뒤의 체크포인트는 이미 쓴 결과를 지켜 주지만, 3단계 자체가 실패하면(쓰는 도중에 죽으면) 체크포인트는 저장될 기회조차 얻지 못합니다. 더 나은 전략은 3단계 전에 저장해 두어, 실패했을 때 문제를 고치고 다시 쓸 수 있게 하는 것입니다."
    }
  ]
}
```

## 상태 패턴 3: 외부 저장소(영속 상태)

**언제 쓰나:** 오래 도는 워크플로(1시간 초과), 여러 머신에 걸쳐 조율해야 하는 작업, 또는 사람의 승인이 필요한 작업.

**장점:** 상태가 영속적입니다. 프로세스가 죽든 머신이 재시작하든 상관없고, 일시 중지와 재개를 지원합니다.

**단점:** 외부 의존(데이터베이스, Redis)이 필요하고 복잡도가 올라갑니다.[^S13]

### 기본 구현

```javascript
// 상태 저장소 인터페이스
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

// 외부 저장소를 쓰는 워크플로
async function persistentWorkflow(workflowId, tasks) {
  const store = new WorkflowStateStore(redis);
  
  // 상태 로드(있다면)
  let state = await store.load(workflowId) || {
    id: workflowId,
    phase: 'init',
    completed: [],
    pending: tasks,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  console.log(`워크플로 ${workflowId}: 단계 ${state.phase}, 
               진행 ${state.completed.length}/${tasks.length}`);
  
  // 1단계: 작업 처리
  if (state.phase === 'init' || state.phase === 'processing') {
    state.phase = 'processing';
    
    while (state.pending.length > 0) {
      const task = state.pending.shift();
      const result = await executeTask(task);
      state.completed.push({ task, result });
      state.updatedAt = Date.now();
      
      // 작업마다 상태 저장
      await store.save(workflowId, state);
    }
    
    state.phase = 'awaiting_approval';
    await store.save(workflowId, state);
  }
  
  // 2단계: 사람의 승인 대기(다른 프로세스나 머신에서 재개될 수 있음)
  if (state.phase === 'awaiting_approval') {
    console.log('승인 대기 중...');
    // 여기서 반환하고, 다른 프로세스가(또는 몇 시간 뒤에) 이어받게 할 수 있다
    return { workflowId, status: 'awaiting_approval' };
  }
  
  // 3단계: 최종 작업 실행(승인 후)
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

// 승인 워크플로
async function approveWorkflow(workflowId) {
  const store = new WorkflowStateStore(redis);
  const state = await store.load(workflowId);
  
  if (!state) throw new Error('워크플로가 존재하지 않습니다');
  if (state.phase !== 'awaiting_approval') {
    throw new Error(`승인할 수 없습니다: 현재 단계는 ${state.phase}입니다`);
  }
  
  state.phase = 'approved';
  state.approvedAt = Date.now();
  await store.save(workflowId, state);
  
  // 워크플로 계속 실행
  return await persistentWorkflow(workflowId, []);
}
```

**핵심 패턴: 상태 기계**[^S11]

워크플로의 단계는 곧 상태 기계의 상태입니다.

```
init → processing → awaiting_approval → approved → finalizing → completed
                         ↓
                     rejected → cancelled
```

모든 단계 전이가 외부 저장소에 저장되고, 그 덕분에 워크플로는 어느 단계에서든 이어서 실행할 수 있습니다.

## 컨텍스트 전달 모범 사례

### 원칙 1: 필요한 것만 전달한다

```javascript
// ❌ 나쁨: 에이전트에게 상태 전부를 넘긴다
const result = await agent({
  task: '이 파일 분석',
  context: workflowState  // 파일 100개의 분석 결과, 설정, 로그...
});

// ✓ 좋음: 관련 정보만 준다
const result = await agent({
  task: '이 파일 분석',
  context: {
    file: currentFile,
    guidelines: workflowState.config.analysisGuidelines,
    similarIssues: workflowState.results
      .filter(r => r.file.type === currentFile.type)
      .slice(0, 3)  // 유사 사례는 최대 3건
  }
});
```

**왜 그럴까요?** 컨텍스트가 클수록 에이전트가 주의를 빼앗기기 쉬워집니다. 추론 품질은 떨어지고 비용은 올라갑니다.[^S15]

### 원칙 2: 컨텍스트를 구조화한다

```javascript
// ❌ 나쁨: 구조 없는 텍스트
const context = `
앞서 47개 파일을 분석해 23개 이슈를 찾았다.
현재 파일은 src/utils.js, 350줄이다.
설정상 SQL 인젝션과 XSS를 검사해야 한다.
`;

// ✓ 좋음: 구조화된 객체
const context = {
  progress: { filesAnalyzed: 47, issuesFound: 23 },
  currentFile: { path: 'src/utils.js', lines: 350 },
  checkTypes: ['sql_injection', 'xss']
};
```

**왜 그럴까요?** 구조화된 컨텍스트는 에이전트가 이해하기도 쉽고, 여러분이 디버깅하기도 쉽습니다.

### 원칙 3: 누적 컨텍스트 vs. 초기화 컨텍스트

**누적 컨텍스트:** 각 단계의 결과가 컨텍스트에 더해져 계속 커집니다.

```javascript
let context = { task: '코드베이스 리팩터링' };

for (const file of files) {
  const result = await agent({ task: '분석', context });
  context.results = context.results || [];
  context.results.push(result);  // 누적
}

// 결국 context에 모든 파일의 결과가 담겨 아주 커질 수 있다
```

**초기화 컨텍스트:** 각 단계에서 컨텍스트를 비우고 필요한 것만 남깁니다.

```javascript
const allResults = [];

for (const file of files) {
  const context = {
    file,
    guidelines: config.guidelines,
    exampleIssues: allResults.slice(-3)  // 최근 3건만
  };
  
  const result = await agent({ task: '분석', context });
  allResults.push(result);  // 컨텍스트가 아니라 워크플로 상태에 담긴다
}
```

**어느 쪽을 고를까:** 대부분의 경우 초기화 컨텍스트를 써서 컨텍스트 폭발을 피합니다. 뒤 단계가 앞의 모든 결과를 정말로 필요로 할 때만(마지막 요약 단계 같은 경우) 누적 컨텍스트를 씁니다.[^S14]

## 상태의 관측 가능성

**좋은 워크플로는 이런 질문에 답할 수 있어야 합니다.**

- 지금 어느 단계에 있는가?
- 얼마나 했고, 얼마나 남았는가?
- 에러를 몇 번 만났는가?
- 언제 끝날 것으로 보이는가?

### 진행 상황 추적 구현

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
                 단계 ${this.state.currentStep}/${this.state.totalSteps}: 
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

// 사용법
async function myWorkflow() {
  const wf = new ObservableWorkflow('데이터 마이그레이션', 4);
  
  const data = await wf.executeStep('원본 데이터 읽기', async () => {
    return await readSourceData();
  });
  
  const transformed = await wf.executeStep('형식 변환', async () => {
    return await transformData(data);
  });
  
  await wf.executeStep('대상 데이터베이스에 쓰기', async () => {
    return await writeToTarget(transformed);
  });
  
  await wf.executeStep('검증', async () => {
    return await validateMigration();
  });
  
  console.log('최종 상태:', wf.getStatus());
}
```

<!-- exercises -->


## 💻 연습

### 레벨 1: 상태 관리 패턴 고르기

아래 세 워크플로에 알맞은 상태 관리 패턴(스크립트 변수, 체크포인트, 외부 저장소)을 고르고 이유를 설명하세요.

**워크플로 A:** 이미지 20장 일괄 압축, 장당 5초, 총 100초

**워크플로 B:** 머신러닝 모델 학습, 에폭당 10분씩 50에폭, 총 500분(8시간)

**워크플로 C:** PR 100건 리뷰, 각각 병합 전에 사람의 승인이 필요하고, 전체 과정이 며칠씩 이어질 수 있음

<!-- rubric -->
패턴 선택이 정확함(A: 스크립트 변수, B: 체크포인트, C: 외부 저장소). 근거가 타당함(소요 시간, 복구 가능성, 사람의 개입 필요 여부를 고려)

<!-- answer -->
워크플로 A: 스크립트 변수. 전체가 100초밖에 되지 않는 아주 짧은 작업이므로, 죽어서 통째로 다시 돌려도 비용이 거의 없고 정교한 상태 관리를 들일 이유가 없습니다. 워크플로 B: 체크포인트. 8시간은 길고, 죽은 뒤에 처음부터 다시 하기에는 너무 비쌉니다. 몇 에폭마다 체크포인트를 두어야 합니다. 다만 학습은 연속적인 작업이라 프로세스를 넘나들 일도, 사람을 기다릴 일도 없으므로 체크포인트로 충분합니다. 워크플로 C: 외부 저장소. 며칠에 걸쳐 진행되고, 사람의 승인이 끼어들며, 워크플로가 멈췄다가 다른 시점 또는 다른 프로세스에서 재개됩니다. 따라서 상태를 외부(예: 데이터베이스)에 영속화해서 진행 상황 조회와 임의 시점 재개를 지원해야 합니다.

<!-- hint -->
세 가지를 따져 보세요. (1) 총 소요 시간이 분 단위인가, 시간 단위인가, 일 단위인가? (2) 죽은 뒤 다시 돌리는 비용이 얼마나 큰가? (3) 멈췄다가 나중에 재개해야 하는가?

<!-- hint -->
스크립트 변수는 빠른 작업(10분 미만)에, 체크포인트는 비용이 큰 작업(10분~몇 시간)에, 외부 저장소는 오래 도는 작업(몇 시간 초과)이나 사람의 개입이 필요한 작업에 맞습니다.

### 레벨 2: 상태 구조 설계하기

"다중 서비스 배포" 워크플로의 상태 객체를 설계하세요. 이 워크플로가 해야 할 일은 (1) 서비스 5개의 Docker 이미지 빌드 (2) 이미지 레지스트리에 푸시 (3) 테스트 환경에 하나씩 배포 (4) 통합 테스트 실행 (5) 테스트를 통과하면 프로덕션에 배포입니다.

**요구 사항:**
- 워크플로 상태를 표현하는 JSON 객체 설계
- 포함할 것: 현재 단계, 서비스별 상태, 에러 정보, 타임스탬프
- 체크포인트를 어디에 저장해야 하는지 설명

<!-- rubric -->
상태 구조가 타당함(단계 표시자, 서비스별 상태를 담은 서비스 목록, 에러 배열, 시간 정보 포함). 서비스별 상태에 충분한 정보가 담김(예: 빌드 상태, 이미지 ID, 배포 상태). 체크포인트 위치를 정확히 짚음(최소한 2단계와 4단계 뒤, 그리고 프로덕션 배포 전)

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
    // ... 나머지 서비스 4개
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
체크포인트 위치: (1) 2단계(push) 완료 뒤 — 빌드와 푸시는 비용이 크므로 다시 돌리지 않게 합니다 (2) 4단계(integration_test) 완료 뒤 — 테스트 통과는 프로덕션 배포의 전제 조건이고, 테스트 자체가 실패해 수정 후 다시 돌려야 할 수도 있습니다 (3) 각 서비스를 프로덕션에 배포하기 전 — 일부만 실패했을 때 복구를 지원합니다.

<!-- hint -->
상태는 이런 질문에 답할 수 있어야 합니다. 워크플로는 어느 단계에 있는가? 각 서비스는 어떤 상태인가(빌드 중 / 빌드 완료 / 배포 완료 / 실패)? 죽으면 어디서부터 이어서 실행하는가?

<!-- hint -->
서비스별 상태는 서로 독립적이므로(한 서비스의 빌드 실패가 다른 서비스의 상태를 바꾸지 않습니다) 서비스마다 자기 상태 필드를 가져야 합니다. 체크포인트는 비용이 큰 작업 뒤, 그리고 되돌릴 수 없는 작업(프로덕션 배포) 전에 둡니다.

<!-- /exercises -->

---

**다음 레슨:** [레슨 5: 에러 처리와 재시도 전략](./05-error-handling-retry.md) — 워크플로가 실패했을 때 곧바로 죽지 않고 우아하게 복구하도록 만드는 법을 배웁니다
