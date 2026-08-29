# レッスン5: エラーハンドリングとリトライ戦略

> 学習目標:
> - 一時的なエラーと永続的なエラーを見分ける
> - リトライ戦略とバックオフアルゴリズムをマスターする
> - 補償アクションとロールバック機構の設計を学ぶ
>
> 前提: [レッスン4: ステート管理とコンテキストの受け渡し](./04-state-and-context.md) | 次: [レッスン6 >>](./06-real-world-workflows.md)

## ワークフローではエラーが常態

あなたのワークフローは10回完璧に動作した。11回目、ステップ8でAPIが503を返した。ワークフローがクラッシュする。

そこで`try-catch`を追加し、エラーをキャッチしてログに記録し、続行させた。12回目の実行で、データベース接続がタイムアウトした。ワークフローは続行したが、書き込みは失敗しており、今やデータは不整合な状態にある。

**エラーハンドリングは「try-catchを追加する」ほど単純ではない。**

ワークフローにおけるエラーハンドリングは、3つの問いに答えなければならない:[^S7]

1. **このエラーは一時的なものか、永続的なものか?** (ネットワークジッターか、権限不足か)
2. **リトライすべきか、スキップすべきか、中断すべきか?** (リトライで直るか、リトライで悪化するか)
3. **中断する場合、すでに完了したステップをどうクリーンアップするか?** (データベースをロールバックするか、キャンセル通知を送るか)

失敗したステップがオプショナル(例えば通知の送信)なら、スキップして先に進む。重要でない失敗が全体の実行を止めないようにすることを、graceful degradation(段階的機能縮退)と呼ぶ。しかし失敗したステップがクリティカルな場合、スキップすると不整合な状態が残るため、中断すべきである。

答えがなければ、あなたのワークフローは脆弱すぎる(小さなエラー1つで停止する)か、危険すぎる(エラーを無視して実行を続け、不整合な状態を残す)かのどちらかになる。[^S9]

## エラーの分類: 一時的 vs 永続的

**一時的なエラー(transient errors)**は一時的なもので、リトライで成功する可能性がある。[^S8]

**よくある一時的エラー:**
- ネットワークタイムアウト
- サービス一時的に利用不可(503 Service Unavailable)
- レート制限(429 Too Many Requests)
- データベース接続プール枯渇
- 一時的なロック競合

**共通点:** これらは通常、リソース競合、ネットワーク変動、または一時的な過負荷から生じており、少し待ってからリトライすると成功する傾向がある。

**永続的なエラー(permanent errors)**はリトライで成功しない。コードや設定の修正が必要。[^S9]

**よくある永続的エラー:**
- 権限不足(401 Unauthorized, 403 Forbidden)
- リソースが見つからない(404 Not Found)
- 不正な入力(400 Bad Request)
- ビジネスロジックエラー(残高不足、在庫ゼロ)
- コードのバグ(null pointer、ゼロ除算)

**共通点:** これらは設定ミス、コードバグ、またはビジネスルール違反から生じており、リトライしてもリソースを無駄にするだけである。

**見分け方:**

```javascript
function classifyError(error) {
  // HTTPステータスコードチェック
  if (error.status === 429) return 'transient';  // レート制限
  if (error.status >= 500) return 'transient';   // サーバー側エラー
  if (error.status === 404) return 'permanent';  // リソースが見つからない
  if (error.status === 401) return 'permanent';  // 権限問題
  
  // エラータイプチェック
  if (error.code === 'ETIMEDOUT') return 'transient';    // タイムアウト
  if (error.code === 'ECONNREFUSED') return 'transient'; // 接続拒否
  if (error.code === 'ENOTFOUND') return 'permanent';    // DNS失敗
  
  // エラーメッセージチェック
  if (error.message.includes('rate limit')) return 'transient';
  if (error.message.includes('permission denied')) return 'permanent';
  
  // デフォルトはpermanent(保守的戦略)
  return 'permanent';
}
```

## リトライ戦略

**一時的なエラーに対しては、リトライが最初の手である。しかしリトライには見た目以上のものがある。**[^S8]

### 戦略1: 固定遅延リトライ

```javascript
async function retryWithFixedDelay(fn, maxAttempts = 3, delay = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      
      console.log(`試行${attempt}回目が失敗、${delay}ms後にリトライします...`);
      await sleep(delay);
    }
  }
}

// 使い方
const data = await retryWithFixedDelay(
  () => fetchAPI('/users'),
  3,
  1000
);
```

**問題点:** エラーが過負荷なサービスから来ている場合、すべてのクライアントが一斉にリトライすると過負荷がさらに悪化する(thundering-herd効果)。

### 戦略2: 指数バックオフ

```javascript
async function retryWithExponentialBackoff(fn, maxAttempts = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`試行${attempt}回目が失敗、${delay}ms後にリトライします...`);
      await sleep(delay);
    }
  }
}

// 遅延シーケンス: 1s, 2s, 4s, 8s, ...
```

**利点:** 各リトライで間隔が倍になり、サービスを叩き続けるのではなく回復のための時間を与える。[^S8]

### 戦略3: 指数バックオフ + ジッター

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
      
      console.log(`試行${attempt}回目が失敗、${delay.toFixed(0)}ms後にリトライします...`);
      await sleep(delay);
    }
  }
}

// 遅延シーケンス(ランダム性あり): 1.2s, 3.7s, 6.1s, ...
```

**利点:** ジッターにより複数のクライアントが完全に同じタイミングでリトライすることを防ぎ、負荷を分散させる。[^S8]

**これがプロダクションで推奨される戦略である。**[^S6]

### 戦略4: 選択的リトライ

```javascript
async function retrySelective(fn, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const errorType = classifyError(error);
      
      if (errorType === 'permanent') {
        console.log('永続的エラー、リトライしません');
        throw error;
      }
      
      if (attempt === maxAttempts) {
        console.log(`${maxAttempts}回のリトライすべてが失敗しました`);
        throw error;
      }
      
      const delay = 1000 * Math.pow(2, attempt - 1) * (1 + Math.random());
      console.log(`一時的エラー、${delay.toFixed(0)}ms後にリトライします...`);
      await sleep(delay);
    }
  }
}
```

**核心的アイデア:** 一時的なエラーのみをリトライする。永続的なエラーは即座にthrowし、無意味なリトライでサイクルを浪費しない。[^S10]

```agentmentor-check
{
  "id": "workflows-zh-05-retry-strategy",
  "label": "適切なリトライ戦略を選ぶ",
  "prompt": "ワークフローが外部APIを呼び出してデータを取得する必要がある。このAPIは1分間に60リクエストを許可しており、それを超えると429を返し、60秒待たなければ続行できない。ワークフローは1分以内に100回APIを呼び出す必要がある。429エラーをどう処理すべきか?",
  "whyHere": "エラー分類(一時的 vs 永続的)とリトライ戦略(固定、指数バックオフ、選択的)を学んだばかりです。これは、特定のエラータイプ(レート制限)を見て、反射的にバックオフに手を伸ばすのではなく、賢明な処理方法を選べるかをチェックします。",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "指数バックオフを使う。遅延が増え続け、最終的に成功する",
      "correct": false,
      "feedback": "バックオフは一時的な過負荷に適しているが、レート制限には既知の回復ウィンドウ(60秒)がある。バックオフは数秒以内に諦めるかもしれないし、その遅延(1s、2s、4s)はウィンドウを乗り切るには短すぎるかもしれない。さらに悪いことに、ワークフローは60/分の上限に対して100回の呼び出しが必要なので、どれだけリトライしても1分以内に完了しない。"
    },
    {
      "id": "b",
      "text": "作業を60リクエストのバッチに分割し、バッチ間で60秒待つ",
      "correct": true,
      "feedback": "正解。429は既知の回復時間を持つ予測可能な一時的エラーである。最善の手は制限を事前に尊重することだ:最初のバッチで60リクエストを送信し、60秒待ってから残りの40を送信する。それでも429が出た場合、前のウィンドウが完全にリセットされていないので、Retry-Afterヘッダーの値を待ってから再試行する。これは盲目的にリトライするより優れている。"
    },
    {
      "id": "c",
      "text": "429は永続的エラー(クォータ枯渇)なので、即座に失敗して管理者に通知する",
      "correct": false,
      "feedback": "429は一時的であり、永続的ではない。これは現在のレートを超えているという意味だが、待てば続行できる。永続的エラーとは、設定ミスや権限不足(401、403)のようなもので、リトライでは直らない。レート制限は一時的である。リクエストレートを遅くするか、ウィンドウがリセットされるのを待つことで解決する。"
    }
  ]
}
```

## サーキットブレーカーパターン

**問題点:** サービスが失敗し続けている場合(例えばクラッシュしたデータベース)、すべてのリクエストが3回リトライすると、無駄にリソースを消費してワークフロー全体を引きずり下ろす。そしてそのサービスが他のサービスの依存関係である場合、失敗はチェーン全体に伝播してカスケード障害になる。

**サーキットブレーカー:** エラー率がしきい値を超えると、失敗しているサービスの呼び出しを一時的に停止し、代わりに即座に失敗させることで、リソースの無駄を回避する。[^S7]

### 3つの状態

```
Closed ──エラー率 > しきい値──→ Open
   ↑                                 ↓
   └──テスト成功──← Half-Open ←──タイムアウト後
```

**Closed:** 正常に動作中。リクエストは通過し、ブレーカーはエラー率を追跡する。

**Open:** サービスは利用不可とみなされる。リクエストは呼び出しなしで即座に失敗する。

**Half-open:** タイムアウト後、いくつかの試験的なリクエストが通過する。成功すればブレーカーはclosedに戻る。そうでなければopenのままである。

### 実装

```javascript
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;  // オープンするまでの失敗回数
    this.resetTimeout = options.resetTimeout || 60000;      // 60秒後に回復を試みる
    
    this.state = 'closed';
    this.failureCount = 0;
    this.nextAttempt = null;
  }
  
  async execute(fn) {
    // Open状態: 即座に失敗
    if (this.state === 'open') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('サーキットブレーカーがオープン、サービスは一時的に利用不可');
      }
      // タイムアウト後、half-openに移行
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
      console.log('サーキットブレーカーがclosed状態に回復しました');
    }
  }
  
  onFailure() {
    this.failureCount++;
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      this.nextAttempt = Date.now() + this.resetTimeout;
      console.log(`サーキットブレーカーがオープンしました、${this.resetTimeout}ms後にリトライします`);
    }
  }
}

// 使い方
const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 30000 });

async function callAPI() {
  return await breaker.execute(async () => {
    return await fetch('/api/data');
  });
}
```

**使うべき場面:** 外部サービス、データベース、ファイルシステム、その他一括で失敗し得る依存関係への呼び出し。[^S7]

## 補償アクションとロールバック

**問題点:** ワークフローが3つの書き込みを行った(データベースへの書き込み、メール送信、キャッシュ更新)後、ステップ4が失敗した。最初の3つをどうアンドゥするか?[^S9]

### パターン1: トランザクショナルな操作

```javascript
async function transactionalWorkflow() {
  const tx = await db.beginTransaction();
  
  try {
    await tx.insert('users', userData);
    await tx.update('accounts', accountData);
    await tx.insert('logs', logData);
    
    await tx.commit();
    console.log('トランザクションをコミットしました');
  } catch (error) {
    await tx.rollback();
    console.log('トランザクションをロールバックしました');
    throw error;
  }
}
```

**適合する場面:** すべての操作がトランザクションをサポートする同一データベース内にある。

**限界:** システムをまたげない(例えばデータベース + ファイルシステム + API呼び出し)。

### パターン2: 補償アクション(Sagaパターン)

**アイデア:** 各操作に補償アクションを定義し、失敗時には補償を実行してすでに完了したステップをアンドゥする。[^S6]

```javascript
async function sagaWorkflow() {
  const completed = [];
  
  const steps = [
    {
      name: '注文作成',
      forward: async () => {
        const order = await createOrder(orderData);
        return { orderId: order.id };
      },
      compensate: async (context) => {
        await deleteOrder(context.orderId);
        console.log(`補償: 注文${context.orderId}を削除しました`);
      }
    },
    {
      name: '在庫減算',
      forward: async (context) => {
        await decrementInventory(orderData.items);
        return context;
      },
      compensate: async (context) => {
        await incrementInventory(orderData.items);
        console.log('補償: 在庫を復元しました');
      }
    },
    {
      name: '支払い請求',
      forward: async (context) => {
        await chargePayment(context.orderId, orderData.amount);
        return context;
      },
      compensate: async (context) => {
        await refundPayment(context.orderId);
        console.log(`補償: 注文${context.orderId}を払い戻しました`);
      }
    },
    {
      name: '確認メール送信',
      forward: async (context) => {
        await sendEmail(orderData.email, context.orderId);
        return context;
      },
      compensate: async (context) => {
        await sendEmail(orderData.email, '注文がキャンセルされました');
        console.log('補償: キャンセルメールを送信しました');
      }
    }
  ];
  
  let context = {};
  
  try {
    // すべてのステップを前進実行
    for (const step of steps) {
      console.log(`実行中: ${step.name}`);
      context = await step.forward(context);
      completed.push(step);
    }
    
    console.log('ワークフローが正常に完了しました');
    return context;
    
  } catch (error) {
    console.log(`失敗: ステップ${completed.length + 1}/${steps.length}`);
    
    // 補償を逆順に実行
    for (let i = completed.length - 1; i >= 0; i--) {
      const step = completed[i];
      try {
        await step.compensate(context);
      } catch (compensateError) {
        console.error(`補償失敗: ${step.name}`, compensateError);
        // 補償の失敗には人間が必要
      }
    }
    
    throw error;
  }
}
```

**要点:**

1. すべてのステップに`forward`(アクション)と`compensate`(アンドゥ)がある。
2. 失敗時には、完了したステップの補償を逆順に実行する。
3. 補償自体も失敗する可能性がある。ログに記録し、人間にフラグを立てる。[^S6]

### パターン3: べき等性のある設計

**べき等:** N回実行しても1回実行したのと同じ効果になる。[^S9]

```javascript
// べき等でない: 繰り返し実行で加算され続ける
async function incrementCounter(userId) {
  const current = await getCounter(userId);
  await setCounter(userId, current + 1);
}

// べき等: 繰り返し実行で同じ結果に落ち着く
async function setCounter(userId, value) {
  await db.update('counters', { userId }, { value });
}

// べき等: 一意のIDで重複排除
async function processOrder(orderId, orderData) {
  // すでに処理済みかチェック
  const existing = await db.get('orders', orderId);
  if (existing) {
    console.log(`注文${orderId}はすでに処理済み、スキップします`);
    return existing;
  }
  
  // 初回実行
  const result = await createOrder(orderData);
  await db.insert('orders', { id: orderId, ...result });
  return result;
}
```

**利点:** ネットワークの不具合でステップが2回実行された場合(最初の試行はタイムアウトしたが実際には成功していた)、べき等性により重複した副作用が発生しないことを保証する。[^S9]

## エラーハンドリングの3つの層

**優れたワークフローは3つの層でエラーを処理する:**

### 層1: 個別の操作

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

### 層2: ワークフローステップ

```javascript
async function workflowStep(stepName, fn) {
  try {
    console.log(`開始: ${stepName}`);
    const result = await fn();
    console.log(`完了: ${stepName}`);
    return result;
  } catch (error) {
    console.error(`失敗: ${stepName}`, error.message);
    
    // ステートに記録
    workflowState.errors.push({
      step: stepName,
      error: error.message,
      timestamp: Date.now()
    });
    
    throw error;
  }
}
```

この層はすべての失敗を`workflowState.errors`に、ステップ名、エラーメッセージ、タイムスタンプとともに書き込む。これがエラーログであり、デバッグ時には記憶ではなくこの記録に頼る。

### 層3: ワークフロー全体

```javascript
async function robustWorkflow() {
  const checkpointFile = '.workflow-checkpoint.json';
  
  try {
    // チェックポイントを読み込む
    let state = await loadCheckpoint(checkpointFile) || { phase: 'init' };
    
    // 各フェーズを実行(スキップロジック付き)
    if (state.phase === 'init') {
      state.data = await workflowStep('データ収集', collectData);
      state.phase = 'collected';
      await saveCheckpoint(checkpointFile, state);
    }
    
    if (state.phase === 'collected') {
      state.processed = await workflowStep('データ処理', () => processData(state.data));
      state.phase = 'processed';
      await saveCheckpoint(checkpointFile, state);
    }
    
    if (state.phase === 'processed') {
      await workflowStep('結果保存', () => saveResults(state.processed));
      state.phase = 'completed';
      await saveCheckpoint(checkpointFile, state);
    }
    
    return state;
    
  } catch (error) {
    // ワークフローレベルのエラーハンドリング
    console.error('ワークフロー失敗:', error);
    
    // 人間に通知
    await notifyAdmin({
      workflow: 'robustWorkflow',
      phase: workflowState.phase,
      error: error.message
    });
    
    throw error;
  }
}
```

**3層の保護:** 操作層でリトライ、ステップ層で記録、ワークフロー層で回復と通知。

<!-- exercises -->


## 💻 演習

### レベル1: エラーを分類してリトライ戦略を設計する

これら3つのエラーそれぞれに対して処理戦略(リトライ / 即座に失敗 / 補償)を設計せよ:

**エラーA:** 支払いAPIを呼び出すと`ETIMEDOUT`エラーが返される

**エラーB:** データベースへの挿入で`duplicate key`エラーが返される

**エラーC:** S3へのファイルアップロードで`403 Forbidden`エラーが返される

**要件:**
- 各エラーが一時的か永続的かを判断せよ
- どう処理するか説明せよ(何回リトライするか、どの戦略か、または即座に失敗か)
- リトライが必要な場合、リトライコードスニペットを書き出せ

<!-- rubric -->
正しい分類(A: 一時的、B: 永続的、C: 永続的)。妥当な処理戦略(A: 3回リトライ + 指数バックオフ、B: すでに存在するかチェック / 即座に失敗、C: 権限設定をチェック / 即座に失敗)。リトライコードには指数バックオフとジッターが含まれている

<!-- answer -->
エラーA (ETIMEDOUT): 一時的。ネットワークタイムアウトは一時的かもしれない。戦略: 指数バックオフ + ジッターで3回リトライ(1s、2-4s、4-8s)。コード: `await retryWithBackoffAndJitter(async () => await callPaymentAPI(data), 3, 1000)`。エラーB (duplicate key): 永続的。主キー競合はレコードがすでに存在することを意味するので、リトライでも失敗する。戦略: レコードが存在するかチェック。同一内容で存在するなら成功として扱う(べき等性)。内容が異なるならthrowして呼び出し側に処理させる。エラーC (403 Forbidden): 永続的。権限問題は設定またはIAMポリシーの変更が必要。戦略: 即座に失敗し、詳細(バケット名、ファイルパス、現在のロール)をログに記録し、管理者に通知して権限を修正してもらう。

<!-- hint -->
タイムアウト(ETIMEDOUT)、接続拒否、503エラーは通常一時的。権限エラー(401/403)、リソース未発見(404)、不正な入力(400)は通常永続的。

<!-- hint -->
duplicate keyは特殊なケース: ワークフローがべき等に設計されている場合(一意のIDで重複排除)、繰り返しの挿入は「すでに完了」としてカウントすべきでエラーではない。

### レベル2: 補償アクションを設計する

「ユーザー登録」ワークフローには4つのステップがある: (1) データベースにユーザーレコードを作成、(2) ユーザーディレクトリ`/users/{userId}/`を作成、(3) ウェルカムメールを送信、(4) メーリングリストに追加。ステップ3または4が失敗した場合、以前のステップをどうロールバックするか?

**要件:**
- 各ステップに対する補償アクションを設計せよ
- Sagaパターンの疑似コード(forwardとcompensate)を書け
- どの補償が失敗する可能性があるか説明し、失敗した場合の対処を述べよ

<!-- rubric -->
すべてのステップに対する妥当な補償(1: ユーザーレコード削除、2: ディレクトリ削除、3/4: キャンセル通知送信)。疑似コードにforward実行と逆順補償ロジックが含まれている。補償も失敗しうることを認識(例: メール送信失敗、ディレクトリ削除権限不足)し、ログに記録して人間が処理する必要があると説明している

<!-- answer -->
ステップ1の補償: `deleteUser(userId)` — データベースからレコードを削除。ステップ2の補償: `deleteDirectory(path)` — ユーザーディレクトリとその内容を削除。ステップ3の補償: 不要(メール送信の失敗はデータ整合性に影響しない)。ステップ4の補償: `removeFromMailingList(email)` — メーリングリストから削除。疑似コードは省略(コースの例を参照)。補償の失敗: (1) ディレクトリ削除が権限不足で失敗する可能性 -> 手動クリーンアップのため失敗キューにログ記録。(2) メーリングリストからの削除がAPIダウンで失敗する可能性 -> リトライキューにログ記録して後で再試行。(3) データベースレコード削除は常に成功すべき(失敗する場合はデータベース自体に問題があり緊急アラートが必要)。要点: 補償の失敗がワークフロー全体を停止させるべきではない。失敗した補償をログに記録し、続行し、最後に管理者に失敗項目のサマリーを送信する。

<!-- hint -->
補償はforwardアクションの「アンドゥ」である: 作成 -> 削除、書き込み -> 削除または上書き、メッセージ送信 -> キャンセルメッセージ送信。

<!-- hint -->
一部のアクションは真にアンドゥできない(すでに送信されたメール、すでに発火したサードパーティのwebhook)。その場合の補償は「アクション自体をアンドゥする」ではなく「影響を受けた関係者にアクションがキャンセルされたことを通知する」である。

<!-- /exercises -->

---

**次:** [レッスン6: 実践での実世界ワークフロー](./06-real-world-workflows.md) — すべてをまとめて3つのプロダクショングレードなワークフローを構築する: コードリファクタリング、ドキュメント生成、テスト自動化
