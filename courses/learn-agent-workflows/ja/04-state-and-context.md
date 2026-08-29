# レッスン4: 状態管理とコンテキストの受け渡し

> 学習目標:
> - ワークフロー状態とエージェントコンテキストを区別する
> - 3つの状態管理パターンを習得する
> - チェックポイントとリカバリを理解する
>
> 前提: [レッスン3: 複雑なタスクをワークフローに分解する](./03-task-decomposition.md) | 次: [レッスン5 >>](./05-error-handling-retry.md)

## 状態管理がワークフローの中核である理由

完璧なワークフローを設計したとします。10ステップ、クリーンな依存関係。ステップ8でサーバーが再起動しました。ワークフローがクラッシュします。

再実行しますか？ すると最初の7ステップの作業 — おそらく30分分 — が捨てられます。

**これが状態管理なしの代償です。**

状態管理は3つの問題を解決します:[^S12]

1. **ステップ間のデータ受け渡し**: ステップ3はステップ1と2の結果をどう取得するか？
2. **進捗追跡**: ワークフローはどこまで進んでいるか？ 残りはどれだけか？
3. **障害リカバリ**: クラッシュ後、最初からやり直すのではなく停止した場所から再開する。

状態管理がなければ、エージェントは会話履歴を通じてのみ情報を渡せます。会話履歴はオーバーフローし、失われ、エージェントに忘れられます。

状態管理があれば、ワークフローは明確な「記憶」を持ちます: 永続的で、クエリ可能で、リカバリ可能です。[^S11]

## 状態 vs. コンテキスト vs. メモリ

この3つの言葉は混同しやすいので、まず定義を固めましょう:[^S12]

**状態**
- 現在のタスクに関するすべての情報: どのステップにいるか、各ステップの結果、次に何をするか
- スナップショットです: この瞬間にワークフローが知っているすべて
- 保存場所: スクリプト変数、データベース、ファイル

**コンテキスト**
- 単一のエージェント呼び出しに渡される情報
- 入力です: このエージェントが仕事をするために必要な情報
- 状態から選択的に引き出されます: すべての状態がエージェントに渡されるわけではなく、関連部分のみ

**メモリ**
- 過去から学んだ教訓: 以前に何をしたか、どんな問題が起きたか、解決策は何だったか
- 履歴です: タスクやセッションをまたぐ長期的な知識
- このレッスンの範囲外です（長期メモリはそれ自体が難しいトピックです）

**例:**

```javascript
// 状態: ワークフローが知っているすべて
const workflowState = {
  phase: 'testing',
  filesProcessed: 47,
  totalFiles: 100,
  issues: [/* 前のステップで見つかったすべての問題 */],
  currentBatch: [/* 現在処理中のファイル */]
};

// コンテキスト: このエージェント用の情報（状態から引き出される）
const agentContext = {
  file: workflowState.currentBatch[0],
  previousIssues: workflowState.issues.filter(i => i.severity === 'high')
};

// エージェント呼び出し
const result = await agent({
  task: 'test file',
  context: agentContext  // 全状態ではなく関連情報のみ
});

// 状態更新
workflowState.filesProcessed++;
workflowState.issues.push(...result.newIssues);
```

**重要な原則: 状態はグローバル、コンテキストはローカルです。**[^S15]

## 状態パターン1: スクリプト変数（インメモリ状態）

**使用場面:** 短いワークフロー（< 10分）でプロセスやマシンをまたぐ必要がない場合。

**長所:** シンプル、高速、外部依存なし。

**短所:** プロセスがクラッシュすると状態が失われ、リカバリする方法がない。

### 基本パターン

```javascript
async function simpleWorkflow(files) {
  // 状態は普通のJavaScript変数
  let processed = 0;
  let results = [];
  let errors = [];
  
  for (const file of files) {
    try {
      const result = await processFile(file);
      results.push(result);
      processed++;
      console.log(`進捗: ${processed}/${files.length}`);
    } catch (error) {
      errors.push({ file, error });
    }
  }
  
  return { results, errors, total: files.length };
}
```

**状態はどこにある？** 関数のローカル変数（`processed`, `results`, `errors`）。

**プロセスがクラッシュしたら？** すべての状態が失われ、最初からやり直します。

### 改良版: 構造化された状態オブジェクト

```javascript
async function betterWorkflow(files) {
  // 状態をオブジェクトで整理 — より明確
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

**なぜ役立つか:** 状態の構造が明確で、他の関数に渡しやすく、（永続化が必要なら）シリアライズしやすい。

## 状態パターン2: チェックポイント

**使用場面:** 中程度の長さのワークフロー（10-60分）で、コストの高い操作後に進捗を保存する必要がある場合。

**長所:** クラッシュ後、最新のチェックポイントから再開でき、作業のやり直しを避けられる。

**短所:** チェックポイントの位置とリカバリロジックを設計する必要がある。[^S12]

### チェックポイント位置の選択

```javascript
async function workflowWithCheckpoints(tasks) {
  const checkpointFile = '.workflow-state.json';
  
  // 以前の状態を復元しようとする
  let state = await loadCheckpoint(checkpointFile) || {
    completed: [],
    pending: tasks,
    phase: 'processing'
  };
  
  console.log(`再開: ${state.completed.length}/${tasks.length} 完了`);
  
  while (state.pending.length > 0) {
    const task = state.pending.shift();
    
    // タスクを実行
    const result = await executeTask(task);
    state.completed.push({ task, result });
    
    // チェックポイント: 10タスクごとに保存
    if (state.completed.length % 10 === 0) {
      await saveCheckpoint(checkpointFile, state);
      console.log(`チェックポイント: ${state.completed.length} タスク完了`);
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
    return null;  // ファイルが存在しない、最初から開始
  }
}
```

**チェックポイント戦略:**

- **定期的チェックポイント**: Nタスクごと、またはM分ごとに保存
- **フェーズチェックポイント**: 各主要フェーズ完了後に保存（例: 「分析フェーズ完了」）
- **クリティカル操作前**: 不可逆な操作の前に保存（例: デプロイ、削除）

```agentmentor-check
{
  "id": "workflows-zh-04-checkpoint-placement",
  "label": "チェックポイントの配置が適切かを判断する",
  "prompt": "データ移行ワークフローには4つのフェーズがあります: (1) ソースデータベースから1000レコードを読み取る（5分） (2) データ形式を変換する（10分） (3) ターゲットデータベースに書き込む（20分） (4) データ整合性を検証する（5分）。チェックポイントを1つだけ設定できるなら、どのフェーズの後に置くべきですか？",
  "whyHere": "チェックポイントの概念と戦略（定期的、フェーズごと、クリティカル操作前）を学んだばかりです。これはタスクの特性（時間コスト、可逆性）から最適なチェックポイント位置を選べるかをチェックします",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "フェーズ1の後。最初のフェーズだから",
      "correct": false,
      "feedback": "フェーズ1はわずか5分しかかからないので、クラッシュ後に再実行してもコストは少ないです。チェックポイントは長い操作や不可逆な操作の後に置くべきで、単に最初のステップというだけでは理由になりません。"
    },
    {
      "id": "b",
      "text": "フェーズ2の後。最もコストが高く、書き込みの前だから",
      "correct": true,
      "feedback": "正解です。フェーズ2は最も長い純粋な計算フェーズ（10分）で、フェーズ3は不可逆な書き込みです。フェーズ2の後のチェックポイントは、コストの高い変換の再実行を避けると同時に、不可逆な書き込みの直前に状態を保存します。フェーズ3が失敗した場合、チェックポイントから再開し、問題を修正して再度書き込めます — 再読み取りや再変換は不要です。"
    },
    {
      "id": "c",
      "text": "フェーズ3の後。書き込みが完了しているから",
      "correct": false,
      "feedback": "フェーズ3の後のチェックポイントは書き込み結果を保護しますが、フェーズ3自体が失敗した場合（書き込みの途中でクラッシュ）、チェックポイントは保存される機会がありません。より良い戦略はフェーズ3の前に保存することで、失敗時に問題を修正して再度書き込めます。"
    }
  ]
}
```

## 状態パターン3: 外部ストレージ（永続状態）

**使用場面:** 長時間実行されるワークフロー（> 1時間）、マシン間で調整が必要な作業、人間の承認が必要な作業。

**長所:** 状態は永続的。プロセスのクラッシュやマシンの再起動は問題にならず、一時停止/再開がサポートされる。

**短所:** 外部依存（データベース、Redis）が必要で、複雑性が増す。[^S13]

### 基本実装

```javascript
// 状態ストアインターフェース
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

// 外部ストレージに支えられたワークフロー
async function persistentWorkflow(workflowId, tasks) {
  const store = new WorkflowStateStore(redis);
  
  // 状態をロード（存在する場合）
  let state = await store.load(workflowId) || {
    id: workflowId,
    phase: 'init',
    completed: [],
    pending: tasks,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  console.log(`ワークフロー ${workflowId}: フェーズ ${state.phase}, 
               進捗 ${state.completed.length}/${tasks.length}`);
  
  // フェーズ1: タスクを処理
  if (state.phase === 'init' || state.phase === 'processing') {
    state.phase = 'processing';
    
    while (state.pending.length > 0) {
      const task = state.pending.shift();
      const result = await executeTask(task);
      state.completed.push({ task, result });
      state.updatedAt = Date.now();
      
      // 各タスク後に状態を保存
      await store.save(workflowId, state);
    }
    
    state.phase = 'awaiting_approval';
    await store.save(workflowId, state);
  }
  
  // フェーズ2: 人間の承認を待つ（別のプロセス/マシンで再開可能）
  if (state.phase === 'awaiting_approval') {
    console.log('承認待ち...');
    // ここでreturnし、別のプロセス（または数時間後）に続きを任せられる
    return { workflowId, status: 'awaiting_approval' };
  }
  
  // フェーズ3: 最終操作を実行（承認後）
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

// 承認ワークフロー
async function approveWorkflow(workflowId) {
  const store = new WorkflowStateStore(redis);
  const state = await store.load(workflowId);
  
  if (!state) throw new Error('ワークフローが存在しません');
  if (state.phase !== 'awaiting_approval') {
    throw new Error(`承認できません: 現在のフェーズは ${state.phase}`);
  }
  
  state.phase = 'approved';
  state.approvedAt = Date.now();
  await store.save(workflowId, state);
  
  // ワークフローの実行を続ける
  return await persistentWorkflow(workflowId, []);
}
```

**重要なパターン: 状態マシン**[^S11]

ワークフローのフェーズは状態マシンの状態です:

```
init → processing → awaiting_approval → approved → finalizing → completed
                         ↓
                     rejected → cancelled
```

すべてのフェーズ遷移が外部ストレージに保存されることで、ワークフローは任意のフェーズから再開できます。

## コンテキスト受け渡しのベストプラクティス

### 原則1: 必要なものだけ渡す

```javascript
// ❌ 悪い: エージェントにすべての状態を渡す
const result = await agent({
  task: 'このファイルを分析する',
  context: workflowState  // 100ファイルの分析結果、設定、ログ...
});

// ✓ 良い: 関連情報のみを渡す
const result = await agent({
  task: 'このファイルを分析する',
  context: {
    file: currentFile,
    guidelines: workflowState.config.analysisGuidelines,
    similarIssues: workflowState.results
      .filter(r => r.file.type === currentFile.type)
      .slice(0, 3)  // 最大3件の類似ケース
  }
});
```

**なぜ？** コンテキストが大きいほど、エージェントは気が散りやすくなり、推論品質が低下し、コストが上がります。[^S15]

### 原則2: コンテキストを構造化する

```javascript
// ❌ 悪い: 非構造化テキスト
const context = `
これまでに47ファイルを分析し、23の問題を発見しました。
現在のファイルは src/utils.js で、350行です。
設定ではSQLインジェクションとXSSをチェックする必要があります。
`;

// ✓ 良い: 構造化されたオブジェクト
const context = {
  progress: { filesAnalyzed: 47, issuesFound: 23 },
  currentFile: { path: 'src/utils.js', lines: 350 },
  checkTypes: ['sql_injection', 'xss']
};
```

**なぜ？** 構造化されたコンテキストはエージェントが理解しやすく、デバッグもしやすい。

### 原則3: 蓄積型コンテキスト vs. リセット型コンテキスト

**蓄積型コンテキスト:** 各ステップの結果がコンテキストに追加され、増え続けます。

```javascript
let context = { task: 'コードベースをリファクタリング' };

for (const file of files) {
  const result = await agent({ task: '分析', context });
  context.results = context.results || [];
  context.results.push(result);  // 蓄積
}

// 最終的にcontextはすべてのファイルの結果を保持し、巨大になる可能性がある
```

**リセット型コンテキスト:** 各ステップでコンテキストをクリアし、必要なものだけを保持します。

```javascript
const allResults = [];

for (const file of files) {
  const context = {
    file,
    guidelines: config.guidelines,
    exampleIssues: allResults.slice(-3)  // 最後の3件のみ
  };
  
  const result = await agent({ task: '分析', context });
  allResults.push(result);  // ワークフロー状態に保持、コンテキストではない
}
```

**どちらを選ぶか:** コンテキスト爆発を避けるため、ほとんどの場合リセット型コンテキストを使います。蓄積型コンテキストは、後のステップが本当にすべての前のステップの結果を必要とする場合（最終サマリーステップなど）のみ使います。[^S14]

## 状態の可観測性

**良いワークフローは次の質問に答えられるべきです:**

- 現在どのフェーズにいるか？
- どれだけ完了したか？ 残りはどれだけか？
- どれだけのエラーに遭遇したか？
- いつ完了すると予想されるか？

### 進捗追跡の実装

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
                 ステップ ${this.state.currentStep}/${this.state.totalSteps}: 
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

// 使用例
async function myWorkflow() {
  const wf = new ObservableWorkflow('データ移行', 4);
  
  const data = await wf.executeStep('ソースデータ読み取り', async () => {
    return await readSourceData();
  });
  
  const transformed = await wf.executeStep('形式変換', async () => {
    return await transformData(data);
  });
  
  await wf.executeStep('ターゲットデータベースに書き込み', async () => {
    return await writeToTarget(transformed);
  });
  
  await wf.executeStep('検証', async () => {
    return await validateMigration();
  });
  
  console.log('最終ステータス:', wf.getStatus());
}
```

<!-- exercises -->


## 💻 演習

### レベル1: 状態管理パターンを選ぶ

以下の3つのワークフローに対して、適切な状態管理パターン（スクリプト変数、チェックポイント、外部ストレージ）を選び、理由を説明してください:

**ワークフローA:** 20枚の画像をバッチ圧縮、各5秒、合計100秒

**ワークフローB:** 機械学習モデルを訓練、50エポック、各10分、合計500分（8時間）

**ワークフローC:** 100個のPRをレビュー、各々マージ前に人間の承認が必要、プロセス全体が数日かかる可能性がある

<!-- rubric -->
正しいパターン選択（A: スクリプト変数、B: チェックポイント、C: 外部ストレージ）; 妥当な理由（期間、リカバリ可能性、人間の関与が必要かを考慮している）

<!-- answer -->
ワークフローA: スクリプト変数。全体でわずか100秒 — 非常に短い — のでクラッシュ後の完全な再実行でもコストは少なく、elaborate な状態管理は不要です。ワークフローB: チェックポイント。8時間は長く、クラッシュ後に最初からやり直すのはコストが高すぎるので、数エポックごとにチェックポイントすべきです。しかし訓練は連続的 — プロセス間の作業も人間待ちもない — のでチェックポイントで十分です。ワークフローC: 外部ストレージ。プロセスは数日続き、人間の承認が含まれ、ワークフローは一時停止して別の時間や別のプロセスで再開するので、状態を外部に永続化（例: データベース）して進捗クエリやいつでも再開をサポートする必要があります。

<!-- hint -->
3つの質問を考えてください: (1) 全体の期間は分、時間、日のどれで測られるか？ (2) クラッシュ後の再実行はどれくらいコストが高いか？ (3) 一時停止して後で再開する必要があるか？

<!-- hint -->
スクリプト変数は短いタスク（< 10分）に適しています。チェックポイントはコストの高いタスク（10分から数時間）に適しています。外部ストレージは長時間実行タスク（> 数時間）や人間の関与が必要なタスクに適しています。

### レベル2: 状態構造を設計する

「マルチサービスデプロイ」ワークフローの状態オブジェクトを設計してください。ワークフローは以下を行います: (1) 5つのサービスのDockerイメージをビルド (2) イメージレジストリにプッシュ (3) テスト環境に1つずつデプロイ (4) 統合テストを実行 (5) テストが通ったらプロダクションにデプロイ。

**要件:**
- ワークフロー状態を表すJSONオブジェクトを設計する
- 含めるべきもの: 現在のフェーズ、サービスごとのステータス、エラー情報、タイムスタンプ
- チェックポイントをどこに保存すべきか説明する

<!-- rubric -->
妥当な状態構造（フェーズマーカー、各サービスのステータスを持つサービスリスト、エラー配列、タイミング情報を含む）; 各サービスのステータスが十分な情報を持つ（例: ビルドステータス、イメージID、デプロイステータス）; チェックポイント位置を正しく特定（少なくともフェーズ2と4の後、プロダクションデプロイ前）

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
    // ... 他の4つのサービス
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
チェックポイント位置: (1) フェーズ2（push）完了後 — ビルドとプッシュはコストが高いので再実行を避ける (2) フェーズ4（integration_test）完了後 — テスト合格はプロダクションデプロイの前提条件で、テスト自体が失敗して修正後に再実行が必要になる可能性がある (3) 各サービスがプロダクションにデプロイする前 — 部分的な失敗後のリカバリをサポート。

<!-- hint -->
状態は次の質問に答えられるべきです: ワークフローはどのフェーズにいるか？ 各サービスはどの状態にあるか（ビルド中 / ビルド済み / デプロイ済み / 失敗）？ クラッシュした場合、どこから再開するか？

<!-- hint -->
各サービスのステータスは独立しています（1つのサービスのビルド失敗は他のステータスを変えない）ので、各サービスは独自のステータスフィールドを持つべきです。チェックポイントはコストの高い操作の後と不可逆な操作（プロダクションデプロイ）の前に置きます。

<!-- /exercises -->

---

**次のレッスン:** [レッスン5: エラーハンドリングとリトライ戦略](./05-error-handling-retry.md) — ワークフローが失敗時に単純にクラッシュするのではなく、優雅にリカバリする方法を学びます
