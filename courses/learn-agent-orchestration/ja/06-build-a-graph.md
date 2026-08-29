# レッスン6: 実践: ハーネスを小さなグラフに引き上げる

> 学習目標:
> - 最初の5レッスンのルーティング、ファンアウト、合流、レビュー回路、レポートを1つの `orchestrate.mjs` に溶接する: 計画はコードの中にあり、各ノードは依然としてコース7（エージェントハーネスの基礎: ループと制御）の `stop_reason` ループを走らせ、中間結果はスクリプトの変数に留まる
> - レビュー回路を実際に回し、その2通りの止まり方を両方見る——1件は gate のレポートどおりに直して完了、もう1件は2ラウンド連続で同じレポートを返し、進展なしと判定され needs_human が立つ
> - グラフ全体の実行トレースを `run-state.json` と `run.jsonl` に永続化し、実行サマリー表と突き合わせる: どのノードがどれだけ時間を使い、モデル呼び出しが何回で、token が何個で、gate が何ラウンド回ったか
>
> 前提: レッスン1〜5を修了し、コース7（エージェントハーネスの基礎: ループと制御）のハーネスループを走らせられること | 前: [<< レッスン5](./05-evaluator-and-graphs.md)

## まずは動かして見る

最初の5レッスンは部品を分解して扱ってきました。誰が計画を持つか（レッスン1）、チェーンとルーティング（レッスン2）、セクショニングと投票、そして上限つきの並行プール（レッスン3）、オーケストレーター・ワーカーと委任プロンプトの4要素（レッスン4）、レビュー回路と、これらのパターンをレッスン5が言うところの「グラフ」に組み上げる方法（レッスン5）。本レッスンはそれらを1つのファイルに溶接します。

タスクはわざと地味にしてあります。`inbox/` にカスタマーサポートのチケットが6件あり、その1件ずつに、そのまま送れる返信を書くのが仕事です。まず、走り終わったときの姿から見てください。

```text
\$ node orchestrate.mjs
inbox/ からチケット 6 件を受領: T-1001, T-1002, T-1003, T-1004, T-1005, T-1006
[route] T-1001=billing  T-1002=bug  T-1003=other  T-1004=billing  T-1005=bug  T-1006=other
[fanout] 並行度の上限 2、初稿 6 件を産出
[merge] out/ に 6 件を書き出し、下流へは参照と一行要約のみ渡す
[review] gate による書き直し: 合計 2 ラウンド

=== グラフ全体の実行サマリー ===
ノード    所要    モデル呼出  token    gate 回数   状態
route     62ms    1           720      -           ok
fanout    247ms   8           8903     -           ok
merge     2ms     0           0        -           ok
review    127ms   2           3033     2           ok

=== チケット別の内訳 ===
チケット カテゴリ  処理者            gate 回数   停止理由        状態
T-1001   billing   worker:billing    0           gate_pass       pass
T-1002   bug       worker:bug        0           gate_pass       pass
T-1003   other     template          0           gate_pass       pass
T-1004   billing   worker:billing    1           no_progress     needs_human
T-1005   bug       worker:bug        1           gate_pass       pass
T-1006   other     template          0           gate_pass       pass

出力ディレクトリ out/: 6 件の返信；人手での引き継ぎが必要: 1 件
  - T-1004 (no_progress): チケット T-1004: 宛名を個人から会社…
トレース: run-state.json / run.jsonl (run_id=run-mta57gsx)
\$ echo \$?
1
```

本レッスンのターミナル出力はすべて、このスクリプトを実際に走らせたものを1行ずつ書き写したもので、手打ちの例は1行もありません。実行ごとに変わるのは2箇所だけです。ミリ秒の所要時間と、`run_id`（タイムスタンプを36進数にしたもの）です。それ以外——分類結果、呼び出し回数、token 数、gate のラウンド数、どのチケットが `needs_human` になるか——はすべて釘付けにされた定数です。その理由は後の「検証の仕掛け」の節で説明します。

まず目を止める価値があるのは、最後のあの `1` です。これはエラーではなく、判定です。6件のうち1件が自動で片付かなかったので、終了コードは 0 ではありません。このグラフの実行は毎回、ログの山ではなく、CI や cron ジョブが読み取れる結論を出します。

## グラフはどう見えるか: 計画は `main()` のあの十数行

まずはスクリプトの骨格から。「グラフ」「ノード」という語を使うのはレッスン5が導入した語彙で、これは私たち独自の作図体系であって公式の概念ではなく、一次資料の錨はちょうど1つだけです。ワークフローのスクリプト自体がループ、分岐、中間結果を保持する[^S5]。以下のコードは、その一文をそのまま実装したものです。

レッスン5は先に組み合わせのグラフを描きました。このグラフはその**一変種**で、3つの違いがあります。レッスン5は難易度で「単純／複雑」に分けましたが、ここではトピックで `billing` / `bug` / `other` に分けます。レッスン5のファンアウトは「1件の複雑なチケットを3人のワーカーに配って合流させる」でしたが、ここはセクショニング——「6件のチケットにそれぞれ処理者を1人割り当てる」です。レッスン5の戻り辺は独立した `[起草]` ノードに戻りましたが、ここでは元のワーカーに戻ります。なぜこう変えたのかは、末尾の「突き合わせ表」の節にまとめてあります。

```javascript
async function main() {
  seedWorkspace();
  initLog();
  saveState();

  const tickets = loadInbox();
  console.log(`inbox/ からチケット ${tickets.length} 件を受領: ${tickets.map((t) => t.id).join(", ")}`);

  const { routed } = await node("route", () => routeNode(tickets));
  console.log(`[route] ${routed.map((t) => `${t.id}=${t.category}`).join("  ")}`);

  const { drafts } = await node("fanout", () => fanoutNode(routed));
  console.log(`[fanout] 並行度の上限 ${POOL_SIZE}、初稿 ${drafts.length} 件を産出`);

  const { items } = await node("merge", async () => mergeNode(drafts));
  console.log(`[merge] out/ に ${items.length} 件を書き出し、下流へは参照と一行要約のみ渡す`);

  if (process.env.STOP_AFTER === "merge") {
    console.log("[stop] STOP_AFTER=merge: review の前で停止、今回の実行に判定はなし");
    process.exit(2);
  }

  const byId = new Map(routed.map((t) => [t.id, t]));
  const reviewed = await node("review", () => reviewNode(items, byId));
  console.log(`[review] gate による書き直し: 合計 ${reviewed.totalRounds} ラウンド`);

  const { needsHuman } = await node("report", async () => reportNode(items, reviewed.totalRounds));

  process.exit(needsHuman > 0 ? 1 : 0);
}
```

`routed`、`drafts`、`items`——この3つの `const` 宣言が、グラフ全体の状態です。何か型付きの状態オブジェクトではなく、ただの JavaScript の変数で、マージ戦略もありません。中間結果はスクリプトの変数に留まり[^S5]、ノード間のデータの受け渡しは関数の戻り値で行われます。全体像を見るモデルは1つもありません。ルーティングのモデルは6件のチケット本文しか見ず、billing ワーカーは割り当てられた1件しか見ず、レビューの gate は1件の返信ファイルしか見ません。

これが、ワークフローとエージェントのアーキテクチャ上の区別がコードになった姿です。LLM とツールが事前定義されたコード経路を通じてオーケストレーションされており[^S1]、モデルが自らのプロセスを自律的に指揮しているのではありません[^S1]。

5つのノードが、それぞれ1区間を担当します。

| ノード | 何をするか | 誰がやるか |
| --- | --- | --- |
| `route` | 安い呼び出し1回で6件を3カテゴリに分ける | モデルループ1つ |
| `fanout` | カテゴリごとに専門ワーカーへ配り、並行度は上限つき | 2種類のモデルループ + 純コードのテンプレート1つ |
| `merge` | 出力をディスクに落とし、下流へは参照と一行要約だけ渡す | 純コード |
| `review` | 決定的な gate で先に濾し、落ちたものだけ「検査・修正・再検査」へ | 純コード + 必要に応じたモデルループ |
| `report` | サマリー表を印字し、終了コードを決める | 純コード |

5つのノードのうち、実際にモデルを呼ぶのは2つだけです。**すべてのノードがモデルである必要はありません**——これは本レッスンでいちばん安上がりで、いちばん見落とされやすいルールです。`merge` と `report` は純粋関数、`fanout` の `other` カテゴリは文字列テンプレート、`review` の第一フィルタは数行の `includes` です。決定的なコードが同じ答えを出せるところで、モデル呼び出しのコストとレイテンシを払う理由はありません。

## ノードの内側: 依然としてコース7のループ

いちばん内側の層を先に押さえれば、グラフの意味が通ります。各モデルノードの内部では、コース7（エージェントハーネスの基礎: ループと制御）の `stop_reason` ループがそのまま走っています。

```javascript
async function runAgent(client, system, userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];
  let turns = 0;

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    tools,
    messages,
  });

  while (response.stop_reason === "tool_use") {
    // —— バルブ1: 最大ターン数。ループ本体の先頭、turns++ の前 ——
    if (turns >= MAX_TURNS) {
      return `最大ターン数 ${MAX_TURNS} に到達したため停止（タスクが難しすぎるか、モデルが行き詰まっている可能性）`;
    }
    turns++;

    // このターンのレスポンス全体（assistant ロール）を履歴に追加
    messages.push({ role: "assistant", content: response.content });

    // このターンの tool_use ブロックをすべて実行し、それぞれを tool_result に包む
    const toolResults = await runToolUses(response.content, toolImpls);

    // 1ターン分の tool_result ブロックは、直後の user メッセージにまとめて入れる
    messages.push({ role: "user", content: toolResults });

    // 伸びた履歴で再送し、while の条件に戻る
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools,
      messages,
    });
  }

  // stop_reason が tool_use でなくなったので、最終テキストを取り出して返す
  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

ループ本体の4ステップ——assistant を push、ツールを実行、tool_result を push、`response` を再代入——は、コース7のレッスン6と一字一句同じで、コメントまで写してあります。バルブ1（最大ターン数）も元の位置、ループ本体の先頭、`turns++` の前にあります。ループの停止条件として最大反復回数を残しておくのは、制御を保つための標準的な実践です[^S1]。

コース7と比べた変更は2箇所、どちらもループ本体の外側です。`client` と `system` がモジュールレベルの定数から引数になりました（3つの役割が別々のスタブと別々のシステムプロンプトを必要とするので、渡さざるを得ません）。そして token と呼び出し回数の計測が、ループ本体の中からクライアントの外側のラッパー層へ移りました。ループの内側は変わっていません。

```javascript
function metered(client) {
  const meter = { calls: 0, tokens: 0 };
  const wrapped = {
    messages: {
      async create(req) {
        const res = await client.messages.create(req);
        meter.calls += 1;
        meter.tokens += res.usage.input_tokens + res.usage.output_tokens;
        return res;
      },
    },
  };
  return { client: wrapped, meter };
}
```

この変更にはコストがあり、それは明言しておく必要があります。コース7のバルブ2（token 予算）は元々ループ本体の中の累算値に依存していました。その累算器がもうループの中にないので、バルブ2も移ってきませんでした。このグラフでは各ノードのスタブのレスポンスキューが固定長で、キューを使い切れば直接 throw するので暴走はしません。しかしスタブを本物のクライアントに差し替えるときは、バルブ2を戻してください。`metered` に予算超過で throw させるか、計測をループ本体に戻してコース7の元の形を復元するかのどちらかです。バルブ3（空回り検知）とバルブ4（人間の承認）も同様に移ってきていません。理由は後の「突き合わせ表」の節に挙げます。

ツール側も写しです。1ターンのレスポンスに `tool_use` ブロックが複数あればその数だけ `tool_result` を返し、ツールが throw したらプロセス全体を落とすのではなく `is_error: true` に包んでモデルに返します。

## ノード1: ルーティング——安い呼び出し1回、そして出力を締める

ルーティングは入力を分類し、専門化された後続タスクへ振り分けます[^S1]。これはグラフでいちばん安いモデル呼び出しです。1リクエストで6件を分類し、ツールもなし、返信も書きません。

```javascript
async function routeNode(tickets) {
  const { client, meter } = metered(makeStubClient(SCRIPTS.router));
  const input = tickets.map((t) => `${t.id}: ${t.text}`).join("\n");
  const text = await runAgent(client, ROUTER_PROMPT, input, [], {});

  // 出力の締め付け: 「チケットID: カテゴリ」の行だけを認識し、ホワイトリスト外のカテゴリは other に落とす
  const parsed = new Map();
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(T-\d+)\s*:\s*(\S+)\s*$/);
    if (!m) continue;
    const [, id, raw] = m;
    const category = CATEGORIES.includes(raw) ? raw : "other";
    if (category !== raw) log({ node: "route", event: "clamped", ticket: id, raw, category });
    parsed.set(id, category);
  }

  const routed = tickets.map((t) => ({ ...t, category: parsed.get(t.id) ?? "other" }));
  for (const t of routed) log({ node: "route", event: "routed", ticket: t.id, category: t.category });
  return { routed, calls: meter.calls, tokens: meter.tokens };
}
```

肝心なのはモデル呼び出しではなく、真ん中の十行です。モデルは自由なテキストを返してきて、下流のすべての分岐がこの値に依存するので、下流に入る前に3つの正当なラベルのどれかに締め付けなければなりません。フォーマットに合わない行は捨て、ホワイトリストにないカテゴリは `other` に落とし、1行もマッチしなかったチケットは `parsed.get(t.id) ?? "other"` が拾います。

最後のチケットについては、スタブがわざと「苦情」を返すようにしてあります——ホワイトリストにはありません。実際の実行ログにこの締め付けが残っています。

```text
{"ts":"2026-08-26T13:41:46.130Z","run_id":"run-mta57gsx","node":"route","event":"clamped","ticket":"T-1006","raw":"苦情","category":"other"}
```

モデルは自分で作ったラベルを返し、コードがそれを `other` に押し戻し、何を押し戻したかの記録を残しました。**下流の分岐は、コードが検証済みの値しか認識しません**——これがルーティングノードと「次にどこへ飛ぶかをモデルに直接決めさせること」の実務上の違いであり、ルーティングがユニットテストできる理由でもあります。

## ノード2: ファンアウト——3人のワーカーと上限つきの並行プール

ファンアウトはセクショニングに従います。タスクを互いに独立したサブタスクに切り分け、並列に走らせるというものです[^S1]。ここでの「独立」は自然に成り立ちます。6件のチケットには互いの依存がゼロで、順序も問いません。

3カテゴリ、3つの処理者、うちモデルは2つだけです。

```javascript
const drafts = await runPool(routed, POOL_SIZE, async (ticket) => {
  if (ticket.category === "other") {
    const text = otherTemplate(ticket.id);
    log({ node: "fanout", event: "template_done", ticket: ticket.id });
    return { ticket, handler: "template", text };
  }
  const r = await callWorker(ticket, 1);
  calls += r.calls;
  tokens += r.tokens;
  return { ticket, handler: `worker:${ticket.category}`, text: r.text };
});
```

並行プールはレッスン3のプールです（あちらでは `pool`、ここでは `runPool`）。タスクをカーソルの後ろに並べ、`limit` 個の消費者を起動して取りに行かせ、尽きたら終わりです。この上限は飾りではなく、本当に効いています。1 に変えてもう一度走らせると、`fanout` の行の所要時間が目に見えて伸びます（呼び出し回数と token は同一、ミリ秒はいつもどおり揺れます）。

```text
\$ POOL_SIZE=1 node orchestrate.mjs
...
=== グラフ全体の実行サマリー ===
ノード    所要    モデル呼出  token    gate 回数   状態
route     62ms    1           720      -           ok
fanout    494ms   8           8903     -           ok
merge     2ms     0           0        -           ok
review    131ms   2           3033     2           ok
```

494ms 対 247ms、呼び出し回数と token は同一です。並行度が買うのはウォールクロック時間であって、仕事量が減るわけではありません——これは本物の API に切り替えても変わらず、ただしそのときはプロバイダのレート制限も考える必要があり、上限はいっそう不可欠になります。

### 委任プロンプト: 4要素すべて揃っている

3つのモデル役割のプロンプトはいずれもレッスン4の4要素——目的、出力フォーマット、ツール指針、タスクの境界——に従っています。サブエージェントには目的、出力フォーマット、使うツールとソースの指針、明確なタスクの境界が必要で、十分な記述がなければワーカーは作業を重複させ、抜けを残し、見つけるべきものを見つけられません[^S2]。billing ワーカーはこうです。

```javascript
billing: [
  "あなたは請求チケットの専門担当で、一度に1件だけ扱います。",
  "目的: このチケットの請求上の事実を突き止め、一度で言い切る日本語の返信を作成すること。",
  "出力フォーマット: プレーンテキストの一段落。冒頭に「チケット <チケットID> の返信:」と書き、判明した事実、すでに実施した処理、ユーザーが次に何を期待できるかを順に述べる。箇条書きは使わず、社交辞令は書かない。",
  "ツール指針: 請求上の事実は必ず lookup_order で調べ、チケット中の注文IDをそのまま渡すこと。見つからなければ見つからないと正直に述べ、チケットの記述から金額や課金回数を推測しないこと。",
  "タスクの境界: このチケットの請求部分のみを扱い、注文を変更せず、追加の補償を約束せず、請求と無関係な質問には答えない。「お待ちください」「今しばらくお待ちください」「早急に対応します」のような中身のない言葉は書かない。",
].join("\n"),
```

4行がそれぞれ仕事をしています。目的が何を書くかを決め、出力フォーマットが下流の gate に検査対象を与え（「冒頭にチケットIDを書く」という要求は gate の第1ルールに直接対応します）、ツール指針が「金額はどこから来るか」を `lookup_order` に釘付けにしてチケットの記述から数字を捏造する道を塞ぎ、タスクの境界が越権行為を止めると同時に、その場しのぎの言葉を先回りして禁じています。

bug ワーカー版は中身を差し替えて、既知不具合DBの照合、issue 番号の引用、番号の捏造禁止になっています。ルーターの「ツール指針」は「このステップではツールを渡さないので、チケット本文だけで判断すること」と述べており、コードで渡している空のツール配列と一致します。この3つのプロンプトの差そのものが、ルーティングの見返りです。分類したあとはそれぞれが自分の分だけを書けばよく、3種類の仕事の要求を1つのプロンプトに詰め込む必要がありません——これがまさに、ルーティングが可能にする関心の分離と、より専門化されたプロンプトです[^S1]。

## ノード3: 合流——ペイロードではなく参照を渡す

`merge` は純コードで、モデル呼び出しはゼロです。やることは2つ。各初稿を `out/` に書き出し、そのうえで下流向けに軽量なマニフェスト `{id, category, handler, file, oneLine}` を集める——ファイルパス1つと一行要約であって、6件の返信全文ではありません。（同時に `run-state.json` にもチケットごとの記録を作ります。フィールドは完全なコードの第9節にあります。）

これはマルチエージェントシステムのエンジニアリング上の助言を、単一プロセスのスクリプトに持ち込んだものです。専門エージェントには成果物を外部システムに保存させ、コーディネーターには軽量な参照だけを返させる[^S2]。あの振り返りでは、この助言は「すべてをリードエージェント経由で中継する」ことによるコンテキストの膨張を解いていました。ここでは同じことの小規模版を解いています。レビューノードが必要なのは「どのファイルを検査すべきか」であって、6件の全文が1つの変数に積まれて回されることではありません。

だからレビューノードの最初の動作は、ファイルから内容を読み直すことです。

```javascript
let reply = fs.readFileSync(full, "utf8").trim(); // ペイロードはファイルから読み込む。前ノードから持ち回らない
```

このステップは冗長に見えます。どうせ同じプロセス内なのだから、文字列をそのまま渡せばよい、と。しかしこれは2つのものを買っています。`out/` のファイルがそのチケットの唯一の真実の源になること——誰が編集してもレビューが見るのはそれです。そして、この辺がプロセスやマシンをまたぐ必要が出たとき、変わるのは `readFileSync` のこの1行だけで、ノード間の契約は動かないことです。

## 小テスト

ここまでで、グラフの5ノードのうち3つが揃いました。ルーティングはコードで締め付けられ、合流は純コード、次に来る gate も純コードです。この時点でいちばんよく聞かれる質問を、そのまま出しておきます。

```agentmentor-check
{
  "id": "orc-zh-06-llm-as-glue",
  "label": "接着ロジックをリードモデルにその場で決めさせるべきかの判断",
  "prompt": "同僚が orchestrate.mjs を読み終えて訊いてきました:「なぜルーティング、合流、gate の接着ロジックをハードコードするのですか。リードモデルに中間結果を見せて次のステップをその場で決めさせたほうが柔軟ではないですか」。この一群のチケットタスクについて、どう答えるべきでしょうか。",
  "whyHere": "5ノードのうち3つが純コードで、読者は決定的な接着層を3つ続けて見たところです。「計画がコードにある」ことが何を買うのか、そしてどんなときに決定権をモデルに戻す価値があるのかを言語化できるかを確かめるのに、ちょうどよい場面です。",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "この種のタスクのステップはもともと事前に分解できるものであり、コードに書き込むことで予測可能性と一貫性が買える。中間結果はスクリプトの変数に留まりモデルのコンテキストを占有しない。本当に分解できない仕事こそ、決定権をモデルに戻す理由になる",
      "correct": true,
      "feedback": "正しい。そしてこれはまさに、ワークフローとエージェントのアーキテクチャ上の区別の実務的な適用です。ワークフローは LLM とツールが事前定義されたコード経路を通じてオーケストレーションされるもの、エージェントはモデルが自らのプロセスを自律的に指揮するものです。タスクが明確に定義されているときはワークフローが予測可能性と一貫性を与え、大規模な柔軟性とモデル主導の意思決定が必要なときはエージェントが正しい選択です。「チケットが届く → 分類する → カテゴリごとに処理する → 検査する → 報告する」という5ステップは、コードの1行目を書く前にすでに決まっていました。モデルに毎回決め直させれば、予測不能性と繰り返しの余分な呼び出しを支払って、このタスクが必要としない柔軟性を買うことになります。副次的な利点として、中間結果がモデルのコンテキストに入りません。スクリプト自体がループ、分岐、中間結果を保持し、モデルのコンテキストはそのステップに必要なものだけを保持します。"
    },
    {
      "id": "b",
      "text": "モデルに舵を取らせるほうが明らかに賢い。リードモデルに各ステップの中間結果を見せて臨機応変に適応させれば、ルーティングも合流も gate もその場の状況に合わせられ、ハードコードされたロジックより強い",
      "correct": false,
      "feedback": "ここでは「賢さ」を換金する先がありません。分類の答えは正当な値が3つしかなく、gate が見るのは「返信にチケットIDが入っているか、その場しのぎの言葉が入っているか」——一度見れば分かる既知の事実です。これをモデルに渡せば毎回違うかもしれない答えが返ってきて、結局それを締め付けるコードを書くことになります。本当のコストはそれだけではありません。モデルが舵を取るには中間結果を見なければならず、6件の返信全文がそのコンテキストに入り、しかもその内容は二度と参照されません。柔軟性には値段があります。本当に必要なときだけ買ってください。"
    },
    {
      "id": "c",
      "text": "どちらのやり方も大差ない。最終的な出力は同じで、あとは個人の好みとチームの習慣の問題なので、どちらを選んでもよい",
      "correct": false,
      "feedback": "これはスタイルの問題ではなく、基準のある判断です。ステップを事前に分解できるかどうか、です。分解できる → コードに書き、予測可能性と一貫性を買う。分解できない——オープンエンドな問い、ステップを事前に予測できない、固定した経路をハードコードできない——そのときこそ自律的なループに戻すべきです。（サブタスクの数と内容はハードコードできないが、全体のステップは自分の手にあるという場合は、レッスン4のオーケストレーター・ワーカーが中間層です。このグラフの仕事はその段階すら必要とせず、分類と振り分けはコードより前に確定していました。）これを好みの問題として扱ったときの最も一般的な帰結は、5ステップのフローの上に、毎ターン進み方を考え直すシステムを育ててしまうことです。高く、遅く、そして何かが壊れたときにどの行を直せばよいのか分かりません。"
    }
  ]
}
```

## ノード4: レビュー回路——gate で先に濾し、落ちたものは炉に戻す

レビューノードがやるのは検査・修正・再検査です。チェッカーを走らせ、失敗したものを直し、通るか、あるいは進展しなくなるまで繰り返す[^S5]。このグラフの中で「モデルの出力が書き直しに送り返される」唯一の場所です。

第一フィルタは決定的で、数行の `includes` で済みます。

```javascript
function gateCheck(ticketId, reply) {
  const problems = [];
  if (!reply.includes(ticketId)) problems.push("missing_ticket_id");
  for (const w of FILLER_WORDS) {
    if (reply.includes(w)) problems.push(`filler_word:${w}`);
  }
  return { pass: problems.length === 0, report: problems.join(" | ") };
}
```

2つのルールはどちらも、コース10（検証と品質保証: 「正しそう」を素通しさせない）が「決定的に判定できるならジャッジに訊くな」と言っていた類のものです。返信にはチケットIDが含まれていなければならず（カスタマーサポートのシステムはそれをキーにします）、「お待ちください」「今しばらくお待ちください」「早急に対応します」のような情報量のない言葉が含まれていてはなりません。どちらも意味理解を要さず、文字列の包含判定で足り、結果は毎回同じで、しかも都合よく、そのままワーカーに投げ返せるレポート文字列が得られます。

ここに LLM のジャッジを置けば「返信の語調は適切か」「事実がツールの返した範囲を超えていないか」といった、`includes` では本当に判定できないことを見られます。ただし gate の後ろに並ばなければなりません。gate は無料で決定的なので、まず明らかな問題を濾させ、残ったものだけがジャッジに1回分の呼び出しを払って相談する価値があります。このグラフには gate の層しか入れていません。この一群のチケットの受け入れ基準がたまたまルールとして書けるからです。受け入れ基準に「語調の適切さ」のような言葉が入るなら、コース10の階層的な判定の割り振りに従ってジャッジの層を足してください。

ループ本体はこうです。

```javascript
while (!gate.pass) {
  reports.push(gate.report);
  if (rounds >= MAX_REVIEW_ROUNDS) {
    verdict = "max_rounds";
    break;
  }
  if (gate.report === lastReport) {
    verdict = "no_progress"; // 2ラウンド連続で同じレポート、ループはもう前に進んでいない
    break;
  }
  if (item.handler === "template") {
    verdict = "no_rewriter"; // 純コードのテンプレートには送り返す先のワーカーがないので、そのまま引き継ぎへ
    break;
  }
  lastReport = gate.report;
  rounds += 1;
  totalRounds += 1;
  const r = await callWorker(byId.get(item.id), rounds + 1, { prev: reply, report: gate.report });
  calls += r.calls;
  tokens += r.tokens;
  reply = r.text;
  fs.writeFileSync(full, `${reply}\n`);
  gate = gateCheck(item.id, reply);
  log({ node: "review", event: "gate", ticket: item.id, round: rounds, pass: gate.pass, report: gate.report });
}
```

3つの `break` が3通りの止まり方に対応しており、レッスン5が宣言したとおりです。通過（`while` の条件が自然に偽になる）、これ以上進展しない、最大ラウンド数に到達。3つ目の `if` は当て木です。`other` カテゴリの返信は純コードのテンプレート生成なので、送り返す先のワーカーがなく、テンプレート自体が壊れていたら人手への引き継ぎしか手がありません。今回の実行では踏んでいません（テンプレートは定数なので必ず gate を通ります）。それでも残してあるのは、誰かがテンプレート文字列を壊したときに、空回りするループより `no_rewriter` の記録が見たいからです。

差し戻しのときにワーカーへ渡すものは単純です。前の版の全文 + gate のレポート + 「レポートで名指しされた問題だけを直し、返信全体を書き直すこと」の一文（組み立ては `callWorker` の中）。

### 2通りの止まり方が、今回の実行で両方とも起きている

スタブに2つの筋書きを仕込んで、ループのそれぞれの出口を1回ずつ通るようにしてあります。

**T-1005: 正しく直って完了。** bug ワーカーの初版はチケットIDを書き忘れており（第1ルール不通過）、gate は `missing_ticket_id` を返し、ワーカーはレポートどおり冒頭行を足し、第2版が通過します。

```text
{"ts":"2026-08-26T13:41:46.444Z","run_id":"run-mta57gsx","node":"review","event":"gate","ticket":"T-1005","round":0,"pass":false,"report":"missing_ticket_id"}
{"ts":"2026-08-26T13:41:46.505Z","run_id":"run-mta57gsx","node":"review","event":"worker_done","ticket":"T-1005","round":2,"calls":1,"tokens":1638}
{"ts":"2026-08-26T13:41:46.506Z","run_id":"run-mta57gsx","node":"review","event":"gate","ticket":"T-1005","round":1,"pass":true,"report":""}
```

**T-1004: 直したが、直っておらず、ループが自分で止まった。** billing ワーカーの初版は「お待ちください」と書き、gate は `filler_word:お待ちください` を返します。ワーカーは書き直し、文はまるごと別物になり、長くなり、説明も増えましたが、その言葉は残ったままです。2ラウンド目のレポートは1ラウンド目と同一です。

```text
{"ts":"2026-08-26T13:41:46.381Z","run_id":"run-mta57gsx","node":"review","event":"gate","ticket":"T-1004","round":0,"pass":false,"report":"filler_word:お待ちください"}
{"ts":"2026-08-26T13:41:46.443Z","run_id":"run-mta57gsx","node":"review","event":"worker_done","ticket":"T-1004","round":2,"calls":1,"tokens":1395}
{"ts":"2026-08-26T13:41:46.443Z","run_id":"run-mta57gsx","node":"review","event":"gate","ticket":"T-1004","round":1,"pass":false,"report":"filler_word:お待ちください"}
```

この瞬間 `gate.report === lastReport` が成立し、ループは進展なしと判定して停止し、このチケットに `needs_human` を立てます。本当はまだ2ラウンド分の予算が残っていましたが（`MAX_REVIEW_ROUNDS` は 3）、使っても無駄になります。同じレポートを投げ返せば、返ってくるのはたいてい同じ返信だからです。「これ以上進展しない」という出口の価値はここにあります。最大ラウンド数より早く損切りでき、しかも情報量のある結論を返します。「3回試してもだめだった」ではなく「このフィードバックを理解していない」——これこそが人間にエスカレーションすべきだというシグナルです。

2つの出口の違いは、データを見れば一目で分かります。

```json
"T-1004": {
  "gate_rounds": 1,
  "gate_reports": [
    "filler_word:お待ちください",
    "filler_word:お待ちください"
  ],
  "stop": "no_progress",
  "status": "needs_human"
},
"T-1005": {
  "gate_rounds": 1,
  "gate_reports": [
    "missing_ticket_id"
  ],
  "stop": "gate_pass",
  "status": "pass"
}
```

2件とも `gate_rounds` は 1 で、ラウンド数だけでは成功と失敗を見分けられません。分かれ目は `gate_reports` の長さです。これは失敗したレポートを毎回記録しており、停止の原因になった最後の1件も含みます。T-1005 は1件しか残していません（第2版が通過したので、2件目のレポートが出ていない）。T-1004 は内容の同じものを2件残しており、`stop` フィールドが結論をそのまま `no_progress` と書いています。

## ノード5: レポートとトレース

最後のノードも純コードです。`state.nodes` とチケット別の内訳を2つの表として印字し、`needs_human` を数え、終了コードを決めます。すべて通過なら 0、1件でも人手が必要なら 1 です。

トレースは2つのファイルに分かれ、それぞれ役割があります。`run.jsonl` はコース11（可観測性とデバッグ: エージェントの一歩一歩を見る）の構造化ログで、1行1 JSON イベント、各行が `ts` と `run_id` を持ち、あとから grep できます——今回の実行は合計 39 行で、前の節の抜粋はすべてそこから逐語で grep したものです。

`run-state.json` は実行のトレースを記録します（「グラフの状態 = あの数個のスクリプト変数」とは別物です）。書き方はコース9（状態管理と永続化: 長いタスクを中断から生き延びさせる）の流儀です。まず `.tmp` に書き、それから `rename` で原子的に差し替えるので、どの瞬間に殺されてもディスク上にあるのは直前の完全な状態か、新しい完全な状態のどちらかで、半分の JSON になることはありません。

```javascript
function saveState() {
  state.updated_at = new Date().toISOString();
  const tmp = `${STATE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_PATH);
}
```

書き込みのタイミングは「小さなステップごとに永続化」です。各ノードが完了するたびに1回、レビューノードの内側ではチケット1件を判定するたびにもう1回。レッスン5が引いた理由——各エージェントの結果を逐次追跡することが、まさに同じセッション内で実行を再開できる前提です[^S5]。多数の小さなエージェントに作業を扇状に広げるワークフローは、1体の長時間エージェントよりも多くの進捗を保全します[^S5]。このグラフはマルチエージェントのランタイムではありませんが、同じ言明がここでも成り立ちます。6件のチケットは6つの独立した進捗単位であり、レビューの途中で死んだとき、すでに永続化されたものが一緒に消えてはいけません（ファンアウトの段階はまだこれを達成できていません——突き合わせ表の項目3を参照）。

この言明の効果を実際に見るには、`STOP_AFTER=merge` でファンアウトの後、レビューの前にプロセスを止めます。

```text
\$ STOP_AFTER=merge node orchestrate.mjs
inbox/ からチケット 6 件を受領: T-1001, T-1002, T-1003, T-1004, T-1005, T-1006
[route] T-1001=billing  T-1002=bug  T-1003=other  T-1004=billing  T-1005=bug  T-1006=other
[fanout] 並行度の上限 2、初稿 6 件を産出
[merge] out/ に 6 件を書き出し、下流へは参照と一行要約のみ渡す
[stop] STOP_AFTER=merge: review の前で停止、今回の実行に判定はなし
\$ echo \$?
2
```

この時点の `run-state.json`（抜粋）はこうです。

```json
{
  "version": 1,
  "run_id": "run-mta4fnpe",
  "nodes": {
    "route": { "ms": 62, "calls": 1, "tokens": 720, "status": "ok" },
    "fanout": { "ms": 248, "calls": 8, "tokens": 8903, "status": "ok" },
    "merge": { "ms": 1, "calls": 0, "tokens": 0, "status": "ok" }
  },
  "tickets": {
    "T-1004": {
      "category": "billing",
      "handler": "worker:billing",
      "file": "out/T-1004.txt",
      "one_line": "チケット T-1004: 請求書の宛名変更は…",
      "gate_rounds": 0,
      "gate_reports": [],
      "stop": null,
      "status": "drafted"
    },
    "T-1005": {
      "category": "bug",
      "handler": "worker:bug",
      "file": "out/T-1005.txt",
      "one_line": "ご報告の事象は既知不具合 KI-91 に該当…",
      "gate_rounds": 0,
      "gate_reports": [],
      "stop": null,
      "status": "drafted"
    }
  }
}
```

3つのノードの勘定は揃っており、6件すべてのカテゴリ、処理者、出力ファイルのパスも揃っており、6件の初稿ファイルはすでに `out/` に永続化されています。失われたのはレビュー区間だけです。すべてのチケットが `status: "drafted"`、`stop: null` で止まっています。この状態があれば再開を支えるのに十分です——`out/` から初稿を読み戻し、レビューノードから直接始められます。T-1005 の `one_line` が、たまたま初稿の欠陥を露出させていることに注目してください。冒頭にチケットIDがありません。レビューがまだ走っていないので、この欠陥はまだ捕まっていないのです。

（`STOP_AFTER` が認識する値は `merge` の1つだけで、コース9の制御されたクラッシュ地点の簡略版です。終了コードは 0 が全件通過、1 が人手の要るチケットあり、2 が早期停止で判定なし、3 がスクリプト自体のクラッシュ——4つのコードは重複せず、CI は「走ったが一部は引き継ぎが要る」と「クラッシュした」を一目で区別できます。）

## 完全な `orchestrate.mjs`

以下が全文です。連続した1ブロックなので、空のディレクトリで `orchestrate.mjs` に貼り付けて `node orchestrate.mjs` を実行してください。依存ゼロ、`npm i` 不要、`package.json` も不要（`.mjs` という拡張子が ES モジュールであることをすでに宣言しています）、API キーも不要です——モデルのクライアントはスタブです。初回の実行で `inbox/`、`kb/`、`out/` が作られ、あの6件のチケットが書き込まれます。

```javascript
// orchestrate.mjs —— チケット一括処理の小さなグラフ: ルーティング → ファンアウト → 合流 → レビュー回路 → レポート
// 依存ゼロ、node orchestrate.mjs で直接動く。モデルのクライアントは固定キューを再生するスタブ。
import fs from "node:fs";
import path from "node:path";

// ============ 0. 定数とディレクトリ ============

const MODEL = "claude-sonnet-5";
const MAX_TURNS = 6;          // 単一ノード内部のループ上限（コース7 バルブ1）
const POOL_SIZE = Math.max(1, Number(process.env.POOL_SIZE) || 2); // ファンアウトの並行度上限（レッスン3）。0 や不正値は 1 にフォールバック
const STUB_LATENCY_MS = 60;   // スタブの固定レイテンシ。本物のネットワーク往復の代わりで、所要時間の列に見せるものを作るため
const MAX_REVIEW_ROUNDS = 3;  // レビュー回路の最大書き直しラウンド数（レッスン5）
const FILLER_WORDS = ["お待ちください", "今しばらくお待ちください", "早急に対応します"];
const CATEGORIES = ["billing", "bug", "other"];

const ROOT = process.cwd();
const INBOX = path.join(ROOT, "inbox");
const OUT = path.join(ROOT, "out");
const KB = path.join(ROOT, "kb");
const STATE_PATH = path.join(ROOT, "run-state.json");
const LOG_PATH = path.join(ROOT, "run.jsonl");

// ============ 1. 入力: inbox/ の6件のチケットと既知不具合DB ============

const TICKET_TEXT = {
  "T-1001": "注文 A-77301 が今月2回引き落とされています。確認して、多く引かれた分を返金してください。",
  "T-1002": "レポートページで「CSV エクスポート」を押すと、ボタンが回り続けたまま5分待っても反応がありません。Chrome、社内ネットワークです。",
  "T-1003": "有人サポートの電話番号は何番ですか。直接電話で聞きたいです。",
  "T-1004": "注文 A-77420 の請求書の宛名が間違っていて、私の個人名で発行されています。会社名義に直してください。",
  "T-1005": "スマホアプリでログインしたあと、アバターがずっと表示されません。ウェブ版では正常です。",
  "T-1006": "3か月使っていますが、何度問題を報告しても音沙汰がありません。この製品はまだ誰か保守しているのでしょうか。",
};

const KNOWN_ISSUES = [
  "## KI-88 レポートページの CSV エクスポートが無反応",
  "影響: エクスポートを押すとボタンが回り続ける。バックエンドのエクスポートキューが滞留している。状態: 3.4.2 で修正済み、リリース待ち。",
  "暫定策: 同じページの「XLSX エクスポート」を使う。データの列は完全に同一。",
  "",
  "## KI-91 モバイル端末でアバターが表示されない",
  "影響: App 側のアバター URL が旧 CDN ドメインを指したまま。ウェブ版は影響を受けない。状態: 修正中、今週金曜のバージョン公開に合わせて反映見込み。",
  "暫定策: 一度ログアウトして再度ログインすると、たいていアバターは表示に戻る。",
].join("\n");

function seedWorkspace() {
  fs.mkdirSync(INBOX, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(KB, { recursive: true });
  for (const [id, text] of Object.entries(TICKET_TEXT)) {
    fs.writeFileSync(path.join(INBOX, `${id}.txt`), `${text}\n`);
  }
  fs.writeFileSync(path.join(KB, "known-issues.md"), `${KNOWN_ISSUES}\n`);
}

function loadInbox() {
  return fs
    .readdirSync(INBOX)
    .filter((f) => f.endsWith(".txt"))
    .sort()
    .map((f) => ({
      id: path.basename(f, ".txt"),
      text: fs.readFileSync(path.join(INBOX, f), "utf8").trim(),
    }));
}

// ============ 2. スタブクライアント: SCRIPTS がチケットIDごとに返信を釘付けにする ============

const say = (text) => ({ type: "text", text });
const call = (id, name, input) => ({ type: "tool_use", id, name, input });
const turn = (stop_reason, content, inTok, outTok) => ({
  stop_reason,
  content,
  usage: { input_tokens: inTok, output_tokens: outTok },
});

const SCRIPTS = {
  // ルーティングノード: 1回の呼び出しで6件を分類する。最終行はわざと正当なラベルにせず、コードにクランプさせる。
  router: [
    turn(
      "end_turn",
      [
        say(
          [
            "T-1001: billing",
            "T-1002: bug",
            "T-1003: other",
            "T-1004: billing",
            "T-1005: bug",
            "T-1006: 苦情",
          ].join("\n")
        ),
      ],
      624,
      96
    ),
  ],

  // billing ワーカー: 注文を調べてから明確に書き、初版で gate を通過する。
  "T-1001#1": [
    turn(
      "tool_use",
      [say("まず注文履歴を調べます。"), call("toolu_a1", "lookup_order", { order_id: "A-77301" })],
      781,
      92
    ),
    turn(
      "end_turn",
      [
        say(
          "チケット T-1001 の返信: 注文 A-77301 は今月たしかに2回課金されており、いずれも 399.00 元で、システム上は重複課金として記録されています。" +
            "多く引き落とされた分は返金申請を提出済みで、元の決済手段へ返金されます。着金までの日数はカード発行会社によりますが、通常は営業日で3〜5日です。" +
            "5営業日を過ぎても着金が確認できない場合は、このチケットに返信してください。取引IDを添えて決済チャネルに照会します。"
        ),
      ],
      1124,
      168
    ),
  ],

  // bug ワーカー: 既知不具合DBを照合してから返信し、初版で gate を通過する。
  "T-1002#1": [
    turn(
      "tool_use",
      [say("まず既知不具合DBを確認します。"), call("toolu_b1", "read_file", { path: "kb/known-issues.md" })],
      763,
      88
    ),
    turn(
      "end_turn",
      [
        say(
          "チケット T-1002 の返信: ご報告の事象は既知不具合 KI-88 に該当します。レポートページの CSV エクスポートでバックエンドのキューが滞留し、ボタンが回り続けるものです。" +
            "修正は 3.4.2 に取り込み済みで、次のバージョン公開後に自動で反映されます。それまでは同じページの「XLSX エクスポート」をご利用ください。データの列は完全に同一です。" +
            "公開日にはこのチケットでお知らせします。"
        ),
      ],
      1312,
      176
    ),
  ],

  // billing ワーカー: 初版にその場しのぎの言葉があり、第2版にも同じ言葉が残る——gate のレポートが2回とも同一になる。
  "T-1004#1": [
    turn(
      "tool_use",
      [say("まずこの請求書の宛名を確認します。"), call("toolu_c1", "lookup_order", { order_id: "A-77420" })],
      786,
      90
    ),
    turn(
      "end_turn",
      [
        say(
          "チケット T-1004: 請求書の宛名変更は経理の確認が必要です。注文 A-77420 の分は申請済みですので、お待ちください。"
        ),
      ],
      1133,
      96
    ),
  ],
  "T-1004#2": [
    turn(
      "end_turn",
      [
        say(
          "チケット T-1004: 宛名を個人から会社に変更するには、経理がシステム上で請求書を無効化して再発行する必要があり、申請はまだ審査待ちのキューにあります。お待ちください。審査が完了しだい、新しい請求書をこのチケットにお送りします。"
        ),
      ],
      1291,
      104
    ),
  ],

  // bug ワーカー: 初版はチケットIDが抜けており、第2版で gate のレポートどおりに追加する。
  "T-1005#1": [
    turn(
      "tool_use",
      [say("既知の不具合かどうかを確認します。"), call("toolu_d1", "read_file", { path: "kb/known-issues.md" })],
      752,
      86
    ),
    turn(
      "end_turn",
      [
        say(
          "ご報告の事象は既知不具合 KI-91 に該当します。App 側のアバター URL が旧 CDN ドメインを指したままで、ウェブ版は影響を受けません。修正は今週金曜のバージョン公開に合わせて反映される見込みです。" +
            "それまでは一度ログアウトして再度ログインしていただくと、アバターは通常表示に戻ります。"
        ),
      ],
      1298,
      158
    ),
  ],
  "T-1005#2": [
    turn(
      "end_turn",
      [
        say(
          "チケット T-1005 の返信: ご報告の事象は既知不具合 KI-91 に該当します。App 側のアバター URL が旧 CDN ドメインを指したままで、ウェブ版は影響を受けません。修正は今週金曜のバージョン公開に合わせて反映される見込みです。" +
            "それまでは一度ログアウトして再度ログインしていただくと、アバターは通常表示に戻ります。公開後も表示されない場合は、このチケットにスクリーンショットを添えてください。アカウントを確認します。"
        ),
      ],
      1466,
      172
    ),
  ],
};

function makeStubClient(queue) {
  let i = 0;
  return {
    messages: {
      async create(req) {
        if (!req.model || !req.max_tokens) {
          throw new Error("スタブクライアント: create には model と max_tokens が必要です");
        }
        if (i >= queue.length) {
          throw new Error(`スタブのキューが尽きました: ${i + 1} 回目のリクエストに対応する応答がありません`);
        }
        await new Promise((r) => setTimeout(r, STUB_LATENCY_MS));
        return queue[i++];
      },
    },
  };
}

// 計測ラッパーはクライアントの外側。ループの内側は変えない。
function metered(client) {
  const meter = { calls: 0, tokens: 0 };
  const wrapped = {
    messages: {
      async create(req) {
        const res = await client.messages.create(req);
        meter.calls += 1;
        meter.tokens += res.usage.input_tokens + res.usage.output_tokens;
        return res;
      },
    },
  };
  return { client: wrapped, meter };
}

// ============ 3. ノードの内側: コース7のループをそのまま持ってきたもの ============

async function runAgent(client, system, userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];
  let turns = 0;

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    tools,
    messages,
  });

  while (response.stop_reason === "tool_use") {
    // —— バルブ1: 最大ターン数。ループ本体の先頭、turns++ の前 ——
    if (turns >= MAX_TURNS) {
      return `最大ターン数 ${MAX_TURNS} に到達したため停止（タスクが難しすぎるか、モデルが行き詰まっている可能性）`;
    }
    turns++;

    // このターンのレスポンス全体（assistant ロール）を履歴に追加
    messages.push({ role: "assistant", content: response.content });

    // このターンの tool_use ブロックをすべて実行し、それぞれを tool_result に包む
    const toolResults = await runToolUses(response.content, toolImpls);

    // 1ターン分の tool_result ブロックは、直後の user メッセージにまとめて入れる
    messages.push({ role: "user", content: toolResults });

    // 伸びた履歴で再送し、while の条件に戻る
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools,
      messages,
    });
  }

  // stop_reason が tool_use でなくなったので、最終テキストを取り出して返す
  return response.content.find((b) => b.type === "text")?.text ?? "";
}

async function runToolUses(content, toolImpls) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");

  return Promise.all(
    toolUseBlocks.map(async (block) => {
      const impl = toolImpls[block.name];
      try {
        const output = await impl(block.input);
        return {
          type: "tool_result",
          tool_use_id: block.id,
          content: output,
        };
      } catch (err) {
        return {
          type: "tool_result",
          tool_use_id: block.id,
          content: `ツール実行エラー: ${err.message}`,
          is_error: true,
        };
      }
    })
  );
}

// ============ 4. 2つのツール ============

const ORDERS = {
  "A-77301": { order_id: "A-77301", amount_cents: 39900, charged_times: 2, status: "duplicate_charge", invoice_title: "山田太郎（個人）" },
  "A-77420": { order_id: "A-77420", amount_cents: 128000, charged_times: 1, status: "paid", invoice_title: "山田太郎（個人）" },
};

const TOOLS = [
  {
    name: "read_file",
    description: "作業ディレクトリ配下のテキストファイルを読む。既知不具合DBやチケット原文の確認用。",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "作業ディレクトリからの相対パス" } },
      required: ["path"],
    },
  },
  {
    name: "lookup_order",
    description: "注文IDで請求上の事実を調べる: 金額、課金回数、状態、請求書の宛名。",
    input_schema: {
      type: "object",
      properties: { order_id: { type: "string", description: "A-77301 のような注文ID" } },
      required: ["order_id"],
    },
  },
];

const toolImpls = {
  read_file({ path: rel }) {
    const full = path.resolve(ROOT, rel);
    if (!full.startsWith(ROOT)) throw new Error("範囲外のパスです");
    return fs.readFileSync(full, "utf8");
  },
  lookup_order({ order_id }) {
    const row = ORDERS[order_id];
    if (!row) throw new Error(`注文が見つかりません: ${order_id}`);
    return JSON.stringify(row);
  },
};

// ============ 5. 3つの委任プロンプト: 目的 / 出力フォーマット / ツール指針 / タスクの境界 ============

const ROUTER_PROMPT = [
  "あなたはカスタマーチケットのルーターです。",
  "目的: 以下の各チケットを billing（請求、課金、請求書、返金）、bug（機能の不具合）、other（それ以外すべて）に分類すること。",
  "出力フォーマット: 1チケット1行、書式は厳密に「チケットID: カテゴリ」、カテゴリは billing / bug / other のいずれか。理由は書かず、他の内容も出力しない。",
  "ツール指針: このステップではツールを渡さないので、チケット本文だけで判断すること。システムを調べたと主張しないこと。",
  "タスクの境界: 分類のみを行い、返信を書かず、結論を出さず、チケットを統合しない。判断がつかない場合は other にすること。",
].join("\n");

const WORKER_PROMPTS = {
  billing: [
    "あなたは請求チケットの専門担当で、一度に1件だけ扱います。",
    "目的: このチケットの請求上の事実を突き止め、一度で言い切る日本語の返信を作成すること。",
    "出力フォーマット: プレーンテキストの一段落。冒頭に「チケット <チケットID> の返信:」と書き、判明した事実、すでに実施した処理、ユーザーが次に何を期待できるかを順に述べる。箇条書きは使わず、社交辞令は書かない。",
    "ツール指針: 請求上の事実は必ず lookup_order で調べ、チケット中の注文IDをそのまま渡すこと。見つからなければ見つからないと正直に述べ、チケットの記述から金額や課金回数を推測しないこと。",
    "タスクの境界: このチケットの請求部分のみを扱い、注文を変更せず、追加の補償を約束せず、請求と無関係な質問には答えない。「お待ちください」「今しばらくお待ちください」「早急に対応します」のような中身のない言葉は書かない。",
  ].join("\n"),
  bug: [
    "あなたは不具合チケットの専門担当で、一度に1件だけ扱います。",
    "目的: このチケットが既知の不具合かどうかを判定し、一度で言い切る日本語の返信を作成すること。",
    "出力フォーマット: プレーンテキストの一段落。冒頭に「チケット <チケットID> の返信:」と書き、一致した既知不具合の番号と結論、暫定策、修正がいつ来るかを述べる。箇条書きは使わず、社交辞令は書かない。",
    "ツール指針: read_file で kb/known-issues.md を読んで照合し、一致したらその番号を本文中で引用すること。一致しなければ一致しないと述べ、不具合番号を捏造しないこと。",
    "タスクの境界: 不具合の特定と返信のみを行い、機能を無効化せず、分単位の修正時刻を約束せず、アカウントのパスワードを尋ねない。「お待ちください」「今しばらくお待ちください」「早急に対応します」のような中身のない言葉は書かない。",
  ].join("\n"),
};

// other カテゴリはモデルに入らない: 純コードのテンプレート。すべてのノードがモデルである必要はない。
const otherTemplate = (id) =>
  `チケット ${id} を受け付けました。このチケットは請求に関わるものでも機能の不具合でもないため、カスタマーサービスチームへ転送し、人手でのフォローに回しています: ` +
  `平日 9:00-18:00 は 400-000-1234 へお電話いただければ直接お話しできます。このチケットに情報を追記していただいてもかまいません。返信はすべてこのチケットに記録されます。`;

// ============ 6. 可観測性: JSONL の構造化ログ + run-state.json の逐次トレース ============

const RUN_ID = `run-${Date.now().toString(36)}`;

function initLog() {
  fs.writeFileSync(LOG_PATH, "");
}

function log(fields) {
  const line = { ts: new Date().toISOString(), run_id: RUN_ID, ...fields };
  fs.appendFileSync(LOG_PATH, `${JSON.stringify(line)}\n`);
}

const state = {
  version: 1,
  run_id: RUN_ID,
  started_at: new Date().toISOString(),
  updated_at: null,
  nodes: {},
  tickets: {},
};

// 原子的な書き込み: まず .tmp に書き、それから rename（コース9の実践）
function saveState() {
  state.updated_at = new Date().toISOString();
  const tmp = `${STATE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_PATH);
}

async function node(name, fn) {
  const t0 = Date.now();
  log({ node: name, event: "node_start" });
  const result = await fn();
  const ms = Date.now() - t0;
  state.nodes[name] = {
    ms,
    calls: result.calls ?? 0,
    tokens: result.tokens ?? 0,
    status: result.status ?? "ok",
  };
  saveState(); // 各ノードの完了ごとに1回永続化
  log({ node: name, event: "node_end", ms, calls: result.calls ?? 0, tokens: result.tokens ?? 0 });
  return result;
}

// ============ 7. ノード1: ルーティング ============

async function routeNode(tickets) {
  const { client, meter } = metered(makeStubClient(SCRIPTS.router));
  const input = tickets.map((t) => `${t.id}: ${t.text}`).join("\n");
  const text = await runAgent(client, ROUTER_PROMPT, input, [], {});

  // 出力の締め付け: 「チケットID: カテゴリ」の行だけを認識し、ホワイトリスト外のカテゴリは other に落とす
  const parsed = new Map();
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(T-\d+)\s*:\s*(\S+)\s*$/);
    if (!m) continue;
    const [, id, raw] = m;
    const category = CATEGORIES.includes(raw) ? raw : "other";
    if (category !== raw) log({ node: "route", event: "clamped", ticket: id, raw, category });
    parsed.set(id, category);
  }

  const routed = tickets.map((t) => ({ ...t, category: parsed.get(t.id) ?? "other" }));
  for (const t of routed) log({ node: "route", event: "routed", ticket: t.id, category: t.category });
  return { routed, calls: meter.calls, tokens: meter.tokens };
}

// ============ 8. ノード2: ファンアウト（セクショニング + 並行プールの上限） ============

async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}

async function callWorker(ticket, round, extra) {
  const key = `${ticket.id}#${round}`;
  const queue = SCRIPTS[key];
  if (!queue) throw new Error(`スタブの筋書きがありません: ${key}`);
  const { client, meter } = metered(makeStubClient(queue));
  const input = extra
    ? [
        `以下はチケット ${ticket.id} に対するあなたの前の版です:`,
        "---",
        extra.prev,
        "---",
        `決定的なチェックに通りませんでした。レポート: ${extra.report}`,
        "レポートで名指しされた問題だけを直し、返信全体を書き直してください。",
      ].join("\n")
    : `チケットID ${ticket.id}\nユーザー原文: ${ticket.text}`;
  const text = await runAgent(client, WORKER_PROMPTS[ticket.category], input, TOOLS, toolImpls);
  log({ node: extra ? "review" : "fanout", event: "worker_done", ticket: ticket.id, round, calls: meter.calls, tokens: meter.tokens });
  return { text, calls: meter.calls, tokens: meter.tokens };
}

async function fanoutNode(routed) {
  let calls = 0;
  let tokens = 0;

  const drafts = await runPool(routed, POOL_SIZE, async (ticket) => {
    if (ticket.category === "other") {
      const text = otherTemplate(ticket.id);
      log({ node: "fanout", event: "template_done", ticket: ticket.id });
      return { ticket, handler: "template", text };
    }
    const r = await callWorker(ticket, 1);
    calls += r.calls;
    tokens += r.tokens;
    return { ticket, handler: `worker:${ticket.category}`, text: r.text };
  });

  return { drafts, calls, tokens };
}

// ============ 9. ノード3: 合流（純コード、ペイロードではなく参照を渡す） ============

function oneLineOf(text) {
  const head = text.split("。")[0];
  return head.length > 22 ? `${head.slice(0, 22)}…` : head;
}

function mergeNode(drafts) {
  const items = drafts.map((d) => {
    const rel = path.join("out", `${d.ticket.id}.txt`);
    fs.writeFileSync(path.join(ROOT, rel), `${d.text}\n`);
    const item = {
      id: d.ticket.id,
      category: d.ticket.category,
      handler: d.handler,
      file: rel,
      oneLine: oneLineOf(d.text),
    };
    state.tickets[item.id] = {
      category: item.category,
      handler: item.handler,
      file: item.file,
      one_line: item.oneLine,
      gate_rounds: 0,
      gate_reports: [],
      stop: null,
      status: "drafted",
    };
    log({ node: "merge", event: "collected", ticket: item.id, file: item.file, chars: d.text.length });
    return item;
  });
  return { items };
}

// ============ 10. ノード4: レビュー回路（決定的な gate を先に、検査・修正・再検査） ============

function gateCheck(ticketId, reply) {
  const problems = [];
  if (!reply.includes(ticketId)) problems.push("missing_ticket_id");
  for (const w of FILLER_WORDS) {
    if (reply.includes(w)) problems.push(`filler_word:${w}`);
  }
  return { pass: problems.length === 0, report: problems.join(" | ") };
}

async function reviewNode(items, byId) {
  let calls = 0;
  let tokens = 0;
  let totalRounds = 0;

  for (const item of items) {
    const full = path.join(ROOT, item.file);
    let reply = fs.readFileSync(full, "utf8").trim(); // ペイロードはファイルから読み込む。前ノードから持ち回らない
    let rounds = 0;
    let lastReport = null;
    const reports = [];
    let verdict = null;
    let gate = gateCheck(item.id, reply);
    log({ node: "review", event: "gate", ticket: item.id, round: 0, pass: gate.pass, report: gate.report });

    while (!gate.pass) {
      reports.push(gate.report);
      if (rounds >= MAX_REVIEW_ROUNDS) {
        verdict = "max_rounds";
        break;
      }
      if (gate.report === lastReport) {
        verdict = "no_progress"; // 2ラウンド連続で同じレポート、ループはもう前に進んでいない
        break;
      }
      if (item.handler === "template") {
        verdict = "no_rewriter"; // 純コードのテンプレートには送り返す先のワーカーがないので、そのまま引き継ぎへ
        break;
      }
      lastReport = gate.report;
      rounds += 1;
      totalRounds += 1;
      const r = await callWorker(byId.get(item.id), rounds + 1, { prev: reply, report: gate.report });
      calls += r.calls;
      tokens += r.tokens;
      reply = r.text;
      fs.writeFileSync(full, `${reply}\n`);
      gate = gateCheck(item.id, reply);
      log({ node: "review", event: "gate", ticket: item.id, round: rounds, pass: gate.pass, report: gate.report });
    }

    const rec = state.tickets[item.id];
    rec.gate_rounds = rounds;
    rec.gate_reports = reports;
    rec.stop = gate.pass ? "gate_pass" : verdict;
    rec.status = gate.pass ? "pass" : "needs_human";
    rec.one_line = oneLineOf(reply);
    item.oneLine = rec.one_line;
    item.status = rec.status;
    item.rounds = rounds;
    item.stop = rec.stop;
    saveState(); // チケット1件を判定するたびに1回永続化
  }

  return { items, calls, tokens, totalRounds };
}

// ============ 11. ノード5: レポート（純コード） ============

const pad = (s, n) => {
  const w = [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 127 ? 2 : 1), 0);
  return String(s) + " ".repeat(Math.max(1, n - w));
};

function reportNode(items, totalRounds) {
  console.log("\n=== グラフ全体の実行サマリー ===");
  console.log(pad("ノード", 10) + pad("所要", 8) + pad("モデル呼出", 12) + pad("token", 9) + pad("gate 回数", 12) + "状態");
  // レポートノード自身はこの表に入らない: それがこの表だから。所要時間は外側の node() が run-state.json に記録する
  const order = ["route", "fanout", "merge", "review"];
  for (const name of order) {
    const n = state.nodes[name];
    if (!n) continue;
    const rounds = name === "review" ? String(totalRounds) : "-";
    console.log(pad(name, 10) + pad(`${n.ms}ms`, 8) + pad(n.calls, 12) + pad(n.tokens, 9) + pad(rounds, 12) + n.status);
  }

  console.log("\n=== チケット別の内訳 ===");
  console.log(pad("チケット", 9) + pad("カテゴリ", 10) + pad("処理者", 18) + pad("gate 回数", 12) + pad("停止理由", 16) + "状態");
  for (const it of items) {
    console.log(
      pad(it.id, 9) + pad(it.category, 10) + pad(it.handler, 18) + pad(it.rounds, 12) + pad(it.stop, 16) + it.status
    );
  }

  const needsHuman = items.filter((it) => it.status === "needs_human");
  console.log(`\n出力ディレクトリ out/: ${items.length} 件の返信；人手での引き継ぎが必要: ${needsHuman.length} 件`);
  for (const it of needsHuman) {
    console.log(`  - ${it.id} (${it.stop}): ${it.oneLine}`);
  }
  console.log(`トレース: run-state.json / run.jsonl (run_id=${RUN_ID})`);
  return { needsHuman: needsHuman.length };
}

// ============ 12. メインフロー: 計画は以下の十数行 ============

async function main() {
  seedWorkspace();
  initLog();
  saveState();

  const tickets = loadInbox();
  console.log(`inbox/ からチケット ${tickets.length} 件を受領: ${tickets.map((t) => t.id).join(", ")}`);

  const { routed } = await node("route", () => routeNode(tickets));
  console.log(`[route] ${routed.map((t) => `${t.id}=${t.category}`).join("  ")}`);

  const { drafts } = await node("fanout", () => fanoutNode(routed));
  console.log(`[fanout] 並行度の上限 ${POOL_SIZE}、初稿 ${drafts.length} 件を産出`);

  const { items } = await node("merge", async () => mergeNode(drafts));
  console.log(`[merge] out/ に ${items.length} 件を書き出し、下流へは参照と一行要約のみ渡す`);

  if (process.env.STOP_AFTER === "merge") {
    console.log("[stop] STOP_AFTER=merge: review の前で停止、今回の実行に判定はなし");
    process.exit(2);
  }

  const byId = new Map(routed.map((t) => [t.id, t]));
  const reviewed = await node("review", () => reviewNode(items, byId));
  console.log(`[review] gate による書き直し: 合計 ${reviewed.totalRounds} ラウンド`);

  const { needsHuman } = await node("report", async () => reportNode(items, reviewed.totalRounds));

  process.exit(needsHuman > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(3); }); // クラッシュは 3 で終了、needs_human の 1 と区別する
```

全体で 679 行、うちおよそ 190 行はスタブに与えるデータ（`SCRIPTS` の表、6件のチケット原文、既知不具合DB、スタブクライアント）で、実際のオーケストレーションのロジック——5つのノード、並行プール、gate、エントリポイント——がおよそ 250 行、残りの 40 行ほどが可観測性と状態トレースです。この規模は意図的なものです。1つのループといくつかのパターンは、本当に数行のコードで実装できるものだからです[^S1]。

## 検証の仕掛け

本レッスンのターミナル出力はすべて、このスクリプトを実際に走らせて得たものです。「何度も走らせて見栄えのよいものを選ぶ」のではなく、非決定性の源を2つ、あらかじめ釘付けにしてあります。

**モデルを、固定キューを再生するスタブに差し替える。** `SCRIPTS` は表で、キーは「チケットID + 第何版か」、値は事前に書いたレスポンスの列です。`messages.create` を呼ぶたびに次の1つを順に吐き出し、キューを使い切ってもなお呼べば直接 throw します。こうすることで「どのチケットが第何ラウンドでどのツールを呼ぶか、モデルがいつ書き終えるか」がすべて定数になります。スタブにはアサーションも1つ残してあります。`create` は `model` と `max_tokens` を必ず持たなければならず、欠ければ throw します——本物のクライアントはこの2つのパラメータを要求するので、スタブが肩代わりしないようにしておけば、本物に差し替えた日に穴を発見することがありません。この手法はコース8の実践からここまでずっと使っています。検証対象があなたの制御ロジックであって、その日のモデルの調子ではないようにするためです（本物のモデルは非決定的で、同じ入力でも異なるレスポンスを返し得ます[^S3]）。

スタブはさらに 60ms の固定遅延を足して、本物のネットワーク往復の代わりにしています。これがないと全ノードが 0ms になり、並行プールの効果がサマリー表にまったく現れません。前掲の `POOL_SIZE=1` の比較（494ms 対 247ms）はこれに依存しています。

**スタブに2つのループの筋書きを仕込む。** レビュー回路が本当に回るには、本当に gate を落ちるものが要ります。そこで:

- `T-1005#1`（bug ワーカーの初版）はわざとチケットIDを落として `missing_ticket_id` を起こし、`T-1005#2` が冒頭行を足して第2版が通過します——これで「検査・修正・再検査」の正常完了の出口を見せます。
- `T-1004#1` と `T-1004#2`（billing ワーカーの2つの版）はどちらも「お待ちください」を抱えています。2つの版は文がまるごと違い、長さも違いますが、gate はその言葉があるかどうかを見るので、2ラウンドのレポート文字列は同一になり、「これ以上進展しない」を起こします——これで損切りの出口を見せます。

この2つの筋書きの書き方には工夫があります。第2版を初版の逐語の繰り返しにはしません（それでは人間が見ても無限ループだと分かってしまいます）。「直したが、正しく直っていない」にしてあります。これは実際のループで最もよく起こる失敗モードであり、まさに「2ラウンド連続で同じレポート」という基準が捕まえるものです。

**制御された早期停止。** `STOP_AFTER=merge` はファンアウトの後、レビューの前でプロセスを止め、終了コードは 2 です。これはコース9の `CRASH_AFTER` の簡略版で、「どのステップで中断するか」を正確に指定できるパラメータにし、運任せで当てにいかないようにするものです。前掲の `drafted` 状態の `run-state.json` は、この実行から得たものです。

## 突き合わせ表: このグラフが前のレッスンに負っている借りを、1行ずつ清算する

コースが総まとめの実践に至ったときにいちばんやりがちな失敗は、前に立てたルールを黙って覆すことです。だからここで1行ずつ突き合わせ、食い違いは明示的に書き出します。

**1. ループ本体はコース7と一致。** ループ本体の4ステップ——assistant を push、ツールを実行、tool_result を push、`response` を再代入——はコース7のレッスン6と一字一句同じで、コメントも変えていません。バルブ1も元の位置にあります。**宣言する差分**: `runAgent` のシグネチャに `client` と `system` の2引数が増えました（3つの役割が別々のスタブと別々のシステムプロンプトを必要とするため）。`create` の呼び出しに `system` フィールドが増えました。token の計測がループ本体から `metered` ラッパーへ移ったため、コース7のバルブ2（token 予算）は付いてきておらず、バルブ3（空回り検知）とバルブ4（人間の承認）も移っていません——このグラフのツールはファイル読み取りと注文照会だけで、どちらも読み取り専用の操作なので承認を要する高影響アクションがなく、スタブのキューは有限なので空回りもできないからです。本物の API につなぐ前に、この3つのバルブは必ず戻してください。

**2. 委任プロンプトは4要素が揃っている（レッスン4）。** ルーター、billing ワーカー、bug ワーカーの3つのプロンプトはいずれも、目的、出力フォーマット、ツール指針、タスクの境界の4節を1行ずつ書いており、1行ずつ突き合わせられます[^S2]。

**3. 並行プールに上限があり、合流はペイロードではなく参照を渡す（レッスン3）。** `runPool` の `limit` は硬い上限で、`POOL_SIZE=1` 対 `POOL_SIZE=2` の所要時間の差ですでに検証しました。`merge` 以降は下流に `{id, category, handler, file, oneLine}` を渡し、全文は `out/` に残り、レビューノードは自分でファイルから読み戻します[^S2]。**宣言する差分**: レッスン3のプールは「同じ一群のサブタスクを並列に走らせる」ものでしたが、ここではプールが3種類の処理者にまたがります——2つのモデルワーカーと1つの純コードテンプレートで、テンプレートがプールに入ってもほとんど時間を使いません。プールの意味論は変わっていません（実行中のタスク数が上限を超えない）。タスク自体が異種混合になっただけです。もう1つ、レッスン3が立てたのにここで省いたものがあります。スクリプトを短くするため、レッスン3が要求していた「レーンごとに別々の `try/catch` を持たせ、1レーンの失敗が一括処理全体を道連れにしないようにする」を `runPool` は備えていません——その代償は、ファンアウトの段階でどれか1レーンが throw すると初稿がまとめて永続化されないことです。本物の API につなぐ前には必ず足してください。本物のネットワークでは1レーンのタイムアウトは日常です。

**4. gate をジャッジより前に、ループの停止条件はレッスン5と一致。** 第一フィルタはモデルではなく決定的なコードです。本レッスンは LLM ジャッジの層を入れていません。この一群のチケットの受け入れ基準がたまたまルールとして書けるので、入れれば金の無駄になるからです——コース10の階層的な判定はこの順序です。決定的に判定できるものを先に判定し、残ったものをジャッジに相談する。ループの停止条件は3種類、通過、これ以上進展しない、最大ラウンド数に到達[^S5][^S1]で、概念としてはレッスン5と1対1に対応します。**ただしフィールド名と値名は変わりました**: レッスン5は `reason` フィールドに着地し、値は `passed`/`no-progress`/`max-rounds` でしたが、ここでは `stop` フィールドに着地し、値は `gate_pass`/`no_progress`/`max_rounds` です（判定者がジャッジから gate に替わり、ハイフンも本レッスンの snake_case の慣習に合わせてアンダースコアに変えました）。さらにレッスン5の `rounds` は生成回数を数えており初稿が第1ラウンドでしたが、本レッスンの `gate_rounds` は書き直し回数を数えており初稿は第0ラウンドです。したがって同じチケットでも、2つのレッスンではラウンド数の起点が1つずれます。**宣言する差分**: コードには4つ目の出口 `no_rewriter` があります（純コードのテンプレートには送り返す先のワーカーがない）。これはレッスン5が取りこぼしたパターンではなく、このグラフに固有の事情です——レッスン5のループは「生産者はモデルである」と前提していましたが、ここでは一部の生産者がテンプレートです。今回の実行ではこの分岐を踏んでいません。

**5. 「グラフ」という言い回しはレッスン5の宣言と一致。** 全文の「グラフ」「ノード」はどちらも本レッスン独自のエンジニアリング上のメタファーであり、レッスン5がこの作図体系を導入するときにすでに明言したとおり、どの一次資料の公式概念でもありません。立てる錨はあの1つだけです。ワークフローのスクリプト自体がループ、分岐、中間結果を保持する[^S5]。本レッスンは新しい用語を1つも足していません——「状態機械」「ノード間を受け渡される状態オブジェクト」はどちらも使っていません。レッスン5が定義した「エッジ」（誰の出力が誰に流れるか）は `merge → review` のデータの流れを説明するときに1度使っただけで、新しい語彙ではありません。`routed` / `drafts` / `items` はただのローカル変数3つです。

**6. `run-state.json` の原子的書き込みはコース9と一致。** まず `.tmp` に書き、それから `renameSync` で差し替える。1ステップも欠けていません。書き込みのタイミングもあのコースの基準どおりで、小さなステップが完了するたびに1回永続化し、実行全体が終わってから1回ではありません。

**7. 可観測性の基準はコース11と同じ形だが、粒度は粗い。** 1行1 JSON イベントで、各行が `ts` と `run_id` を持ち、あとから grep できます。**4つの差分**: (a) コース11のロガーは内容の要約（形、長さ、先頭数文字）を記録しますが、本レッスンは ID、カテゴリ、ファイル名、レポート文字列と各種カウントしか記録せず、返信の全文は記録しません——全文はすでに `out/` にあります。(b) 関連付けのフィールドをコース11は `trace_id` と呼びますが、ここでは `run_id` と呼んでいます。(c) あのコースの核心は `span_id`/`parent_id` でトレースのツリーをつなぐことですが、このグラフはノード→ワーカー→ツールの3層入れ子であるにもかかわらず親子の紐付けを実装しておらず、トレースのツリーがありません。(d) `initLog()` は実行のたびに `run.jsonl` をクリアし、最新の1回分しか残しません。コース11の実行間の比較（`v-good` 対 `v-bug`）をやるには、`run_id` ごとに別ファイルへ追記する方式に変える必要があります。このグラフを本物のトレースシステムにつなぐには、コース11の span フィールドをあのパターンに従って足す必要があります。

**8. オーケストレーター・ワーカーのパターンは、本レッスンが意図的に実装していない（レッスン4）。** レッスン4のオーケストレーター・ワーカーの肝は「何件配るか、それぞれ何をするか」をモデルが入力を見てその場で決めることです。このグラフはそうではありません。6件のチケットをどう分類するか、各カテゴリがどのワーカーへ行くかは、コードの1行目を書く前に `CATEGORIES` と3つの定数プロンプトに固定されています。これはまさにレッスン4の「事前定義できるなら動的にしない」の直接の適用です。この一群の仕事の形は既知なので、決定権をモデルに戻すべきではありません。したがって厳密に言えば、このファイルに溶接されているのは4つのパターン（チェーン、ルーティング、並列化のセクショニング、レビュー回路）で、投票はレベル2の演習で5つ目として補い、オーケストレーター・ワーカーはこの一群のタスクの性質によって外された1つです。

## 境界

このグラフが面倒を見ているものは小さいです。1プロセス、1バッチのチケット、走って終わる。作る価値があるのは、「チケットが届く → 分類する → カテゴリごとに処理する → 検査する → 報告する」という5ステップが、コードの1行目を書く前に確定していたからです。もしタスクが「この顧客が過去半年に実際に何に遭遇したのかを突き止めよ、何ステップ必要かは自分で判断せよ」になったら、このグラフは間違ったアーキテクチャです。事前にステップを予測できず、固定した経路をハードコードできない、その種のオープンエンドな問題は、本質的に自律的なループに属します[^S1]。

いくつかの境界を、明示しておきます。

**ファンアウトは同期で、規模が大きくなると痛みます。** `fanoutNode` のプールは、一括処理全体の完了を待ってから `merge` に入らなければなりません。これはまさに、あの実運用システムが認めていたボトルネックです。同期実行は調整を単純にしますが、情報の流れにボトルネックを作ります——1体のサブエージェントが長引けば、システム全体がそれを待って止まります[^S2]。6件で各件たかだか2回の呼び出しなら、このボトルネックはまったく痛みません。600 件で各件 10 回になれば、「最も遅い1件がバッチ全体のウォールクロック時間を決める」に変わります。非同期に変えるかどうかは、代償を計算しなければなりません。非同期はエージェントを同時に働かせ、必要に応じて新しいものを起動させますが、結果の調整、状態の一貫性、サブエージェントをまたぐエラーの伝播という難しさを追加します[^S2]——この3つは同期版には存在しません。順序がコードで決まっているからです。

**レビュー回路の2つのルールは浅く、脆いです。** `includes("お待ちください")` は「お待ちくださいと言う必要はなく、すでに処理済みです」のような文もその場しのぎと誤判定します。これはコース10が昔から警告していた問題です。厳しすぎる決定的な検証器は、正しいものを誤りと判定します。本番で使うなら、この2つのルールは実際の返信の小さな一群に対して較正するか、あるいは「ジャッジの再確認に回すフラグ」に格下げして、直接書き直しに送り返さないようにする必要があります。

**本物の API に差し替えても、動かすのはスタブだけで、構造は動きません。** `makeStubClient(queue)` を `new Anthropic()` に替え、`SCRIPTS` の表をまるごと削除すれば、残りは1行も変わりません——`runAgent` は最初から本物の API の `stop_reason` / `tool_use` / `tool_result` の形に合わせて書かれており、`model` と `max_tokens` も常に持たせてあります。差し替えたあと3つのことが変わります。分類結果が揺れる（同じチケットでも2回の実行で別のカテゴリに落ちうる）、gate のラウンド数が揺れる、token 数が揺れる。1回走らせるのに金と時間がかかる。そしてコース7の移っていない3つのバルブを必ず戻すこと。

**複雑さを1層足すたびに「測定可能な改善」というゲートを通すこと。** このグラフのどのパターンも、個別に外せます。ルーティングをやらず、汎用のプロンプト1つでチケットに返信することもできます。ファンアウトをやらず、6件を直列に走らせても終わります。レビュー回路をやらず、人手の抜き取り検査という手もあります。外したときに指標が下がるのか、どれだけ下がるのかは、試さなければ分かりません。複雑さが本当に結果を改善するときにだけ、それを足す価値があります[^S1]。

## 💻 演習

<!-- exercises -->

### レベル1: 図を読む——ループの中で実際に何が起きたか

以下はこのグラフを1回完全に走らせたときのサマリー表と、`run-state.json` から取った2件のチケットの記録です（実際の実行結果で、ミリ秒と `run_id` は毎回変わります）。

```text
=== グラフ全体の実行サマリー ===
ノード    所要    モデル呼出  token    gate 回数   状態
route     62ms    1           720      -           ok
fanout    247ms   8           8903     -           ok
merge     2ms     0           0        -           ok
review    127ms   2           3033     2           ok

=== チケット別の内訳 ===
チケット カテゴリ  処理者            gate 回数   停止理由        状態
T-1001   billing   worker:billing    0           gate_pass       pass
T-1002   bug       worker:bug        0           gate_pass       pass
T-1003   other     template          0           gate_pass       pass
T-1004   billing   worker:billing    1           no_progress     needs_human
T-1005   bug       worker:bug        1           gate_pass       pass
T-1006   other     template          0           gate_pass       pass
```

```json
"T-1004": {
  "category": "billing",
  "handler": "worker:billing",
  "file": "out/T-1004.txt",
  "one_line": "チケット T-1004: 宛名を個人から会社…",
  "gate_rounds": 1,
  "gate_reports": ["filler_word:お待ちください", "filler_word:お待ちください"],
  "stop": "no_progress",
  "status": "needs_human"
},
"T-1005": {
  "category": "bug",
  "handler": "worker:bug",
  "file": "out/T-1005.txt",
  "one_line": "チケット T-1005 の返信: ご報告の事…",
  "gate_rounds": 1,
  "gate_reports": ["missing_ticket_id"],
  "stop": "gate_pass",
  "status": "pass"
}
```

コードを書かずに、3つ答えてください。(1) 6件のうちレビュー回路に入ったのはどれで、それぞれ何ラウンド回りましたか。どのフィールドから読み取りましたか。(2) T-1004 と T-1005 の `gate_rounds` はどちらも 1 なのに、なぜ一方が `pass` で他方が `needs_human` なのですか。証拠はどのフィールドにあり、どう読みますか。(3) ファンアウトが完了した直後、レビューが始まる前にプロセスが殺されたと仮定します。`run-state.json` は何を保全でき、何が失われますか。再起動後はどのステップから再開できますか。

<!-- rubric -->
- (1) T-1004 と T-1005 が回路に入り、それぞれ1ラウンド回った。根拠はチケット別の表の `gate 回数` 列が 0 でないこと、あるいは `run-state.json` の `gate_rounds` が 0 より大きいこと。他の4件は 0 で、初稿が一発で gate を通ったことを意味する。サマリー表の `review` 行の gate 回数 2 は、この2件の1ラウンドずつの合計
- (2) 分かれ目は `gate_rounds` ではなく `gate_reports`。T-1005 はレポートが `missing_ticket_id` の1件だけで、書き直した第2版が検査を通り、2件目のレポートを出さなかったことを意味するので `stop` は `gate_pass`。T-1004 は内容の同じ `filler_word:お待ちください` が2件あり、書き直しても gate のレポートがまったく変わらなかったことを意味し、「2ラウンド連続で同じレポートなら進展なしと判定」を起こすので `stop` は `no_progress`、`status` は `needs_human`。`gate_rounds` は書き直し回数、`gate_reports` は失敗したレポートを毎回（最後の1件も含めて）記録するもので、この2つは等価ではないと指摘していること
- (3) 保全されるもの: `nodes` に `route` / `fanout` / `merge` の3ノードの所要時間と使用量。6件の `category`、`handler`、`file`、`one_line`。そして `out/` にすでに永続化された6件の初稿ファイル。失われるもの: レビューの判定。すべてのチケットが `status: "drafted"`、`stop: null`、`gate_reports: []` のまま。再起動後は `out/` から初稿を読み戻してレビューノードから直接始められ、route とファンアウトをやり直す必要はない——状態の永続化が、実行全体の完了後に1回ではなく、各ノードの完了ごとに1回だから
- この「逐次トレース」の意義を説明していること: 実行中に各ステップの結果を逐次記録することが、まさに実行を再開可能にする前提である。あわせてコース9の「`.tmp` に書いてから `rename`」の原子的書き込みと対になっており、その瞬間に殺されてもディスク上にあるのは直前の完全な状態か新しい完全な状態のどちらかである

<!-- answer -->
(1) 回路に入ったのは T-1004 と T-1005 で、それぞれ1ラウンド回りました。いちばん直接的なフィールドはチケット別の表の `gate 回数` 列（`run-state.json` では `gate_rounds`）です。この2件が 1、他の4件が 0 です。0 は初稿が最初の検査で gate を通り、ワーカーが1度も呼び戻されなかったことを意味します。サマリー表の `review` 行のあの 2 は、この2件の1ラウンドずつの合計であって、どれか1件が2ラウンド回ったのではありません。

(2) `gate_rounds` だけを見ても、たしかに成功と失敗は見分けられません。これは「ワーカーを何回呼び戻して書き直させたか」を数えるだけで、書き直しの結果が良かったか悪かったかには関心がないからです。本当の証拠は `gate_reports` です。これは失敗したレポートを毎回、ループを止めた最後の1件も含めて記録します。T-1005 の配列には `missing_ticket_id` の1件しかありません。初稿にチケットIDがなく送り返され、書き直した第2版がそれを足して gate を通り、もう1件のレポートが出なかったので、`stop` は `gate_pass`、`status` は `pass` と記録されます。T-1004 の配列には2件あり、しかも文字列が同一で、どちらも `filler_word:お待ちください` です。初稿が「お待ちください」と書いて送り返され、ワーカーは書き直しました——文は変わり、長くなり、説明も増えました——が、その言葉は残ったままで、gate が返したレポートは前のラウンドと一字一句同じでした。ループの基準は「今ラウンドのレポートが前ラウンドと同じなら進展なしと判定」なので、残る2ラウンド分の予算を使わずにそのまま停止し、`needs_human` を立て、`stop` に `no_progress` と記録しました。一文でいえば、`gate_rounds` は書き直しの回数を数え、`gate_reports` は書き直しのたびに違う結果が出たかどうかを映します。

(3) 保全される部分は少なくありません。`nodes` にはすでに `route`、`fanout`、`merge` の3つの完全な勘定（所要時間、モデル呼び出し回数、token）があり、6件のチケットにはそれぞれ `category`、`handler`、`file`、`one_line` があり、`out/` ディレクトリの6件の初稿ファイルはすべて書き出されて永続化されています。失われるのはレビュー区間だけです——すべてのチケットが `status: "drafted"`、`stop: null`、`gate_reports` は空配列で、誰を書き直すべきか、誰を引き継ぐべきかがまだ判定されていません。そのため再起動後は route とファンアウトを完全に飛ばし（この2ステップの成果物はすべてディスク上にあります）、`out/` から6件の初稿を読み戻して、レビューノードに直接入れます。これができるのは状態の書き込みタイミングのおかげです。各ノードの完了ごとに1回永続化し、レビューの内側ではチケット1件を判定するたびにもう1回永続化しており、実行全体が終わるのを待ってから書くのではありません。各ステップの結果を逐次記録することが、まさに同じセッション内で実行を再開可能にする前提です。本レッスンが状態をディスクまで広げたのは自前で足した一段の格上げです。これを「`.tmp` に書いてから `rename`」の原子的な差し替えと組み合わせることで、どの瞬間に殺されてもディスク上にあるのはどちらか一方の完全な状態であり、読み戻すことすらできない半分の JSON が残ることはありません。

<!-- hint -->
まず2つのフィールドがそれぞれ何を数えているかを区別してください。一方は「ワーカーを何回呼び戻したか」を数え、もう一方は「毎回の検査レポートが何と言ったか」を記録します。2件のチケットは前者の数が同じで、後者の長さと内容が違います——差はそこに隠れています。

<!-- hint -->
3つ目の設問は推論せず、あの `STOP_AFTER=merge` の実行から貼った `run-state.json` を直接見てください。どのキーに値が入っていて、どのチケットのフィールドが初期値のままか（`stop` が `null`、`gate_reports` が `[]`、`status` が `drafted`）。値が入っているものが保全されたもので、初期値のままのものが失われたものです。

### レベル2: グラフに投票ノードを足す

`other` カテゴリに、語調の加減が難しいチケットが1件あります——T-1006:「3か月使っていますが、何度問題を報告しても音沙汰がありません。この製品はまだ誰か保守しているのでしょうか」。固定のテンプレート1つでこれに返信するのは、たいてい不適切です。冷たすぎればあしらったように見え、温かすぎれば過剰な約束のリスクがあります。

このグラフに投票ノードを足してください。同じチケット、同じタスクを、2つの角度から1回ずつ走らせ[^S1]、それから純コードで両方の版を比較し、優れたほうを合流に入れます。比較のルールは2つだけで、どちらもモデルに訊いてはいけません。まず gate の決定的なルールで足切りし（禁止語があるかチケットIDがなければ即失格）、生き残ったほうから短いほうを選びます（カスタマーサポートの返信は冗長にしない）。

要求: 2つの角度のプロンプトはどちらも4要素を備えること。2回の呼び出しはどちらも正直に `runAgent` を通ること（つまり完全なループを通ること）で、スタブはそれぞれにレスポンスキューを1つ用意すること。選抜の過程はターミナルと `run.jsonl` に痕跡を残し、なぜこの版が選ばれたのかが分かるようにすること。書き終えたら実際に1回走らせ、出力を貼ること。あわせて1つ答えてください。ここで純コードの比較を使い、モデルにどちらの版が良いか判定させないのはなぜですか。

<!-- rubric -->
- 2つの角度は同じタスクへの異なる入り方であること（たとえば「まず感情を受け止める」対「事実だけを述べる」）。タスクを半分に割るのではない——これは投票であって、セクショニングではない
- 2回の呼び出しがどちらも完全な `runAgent` のループを通り、それぞれにスタブのレスポンスキューが1つあること。モデル呼び出し回数と token がサマリー表で対応して増えていること（ベース版と比べて呼び出しが2回増える）
- 2つの角度のプロンプトが、目的、出力フォーマット、ツール指針、タスクの境界の4要素を完全に書いていること
- 選抜が純コードであること: まず `gateCheck` で足切りし、通過した候補の中から長さが最短のものを選ぶ。2つのルールの順序が明記され、今回どちらのルールが決め手になったかを言えること
- 痕跡: ターミナルに、2つの候補それぞれの判定と長さ、そして最終的にどちらが選ばれたかを示す行が1行あること。`run.jsonl` に対応する構造化イベントがあること
- 2つの角度は直列に走らせること。あるいは並行にしてもプールの上限を壊さない理由を明示すること——プールの内側でこっそりもう1層の並行を開き、総並行度を `POOL_SIZE × 2` にしてはいけない
- 純コードにしてジャッジにしない理由を明記していること: この2つのルール（禁止語、長さ）はそもそも決定的に判定でき、同じ入力なら永遠に同じ結果で、呼び出しの費用もかからず、新しい非決定性も持ち込まない。LLM のジャッジは「語調は適切か」のようなルールに書き下せない判断のために取っておくべきで、しかも決定的なチェックの後ろに並べなければならない

<!-- answer -->
変更は4箇所に集中します。定数を1つ、スタブのレスポンスキューを2つ、角度のプロンプトを2つ、そして `fanoutNode` に分岐を1つ足し、関数を2つ追加します。それ以外のコードは1行も動きません。

1箇所目、どのチケットが投票を要するかを印します。

```javascript
const CATEGORIES = ["billing", "bug", "other"];
const VOTE_TICKETS = new Set(["T-1006"]); // 語調の加減が難しく、2つの角度を走らせる価値のあるチケット
```

2箇所目、スタブにレスポンスキューを2つ足します（`SCRIPTS` の `T-1005#2` の後ろ）。

```javascript
  // 投票: 同じチケットを、2つの角度で1回ずつ走らせる。
  "T-1006@warm#1": [
    turn(
      "end_turn",
      [
        say(
          "チケット T-1006 の返信: まずお詫びします。結果をお返しできていなかったのは私たちの追跡不足です。" +
            "3か月分を整理し直し、担当へ転送しました。早急に対応します。" +
            "製品は保守を継続しており、更新はヘルプセンターの「更新履歴」でご確認いただけます。"
        ),
      ],
      812,
      164
    ),
  ],
  "T-1006@plain#1": [
    turn(
      "end_turn",
      [
        say(
          "チケット T-1006 の返信: 製品は保守を継続しており、更新はヘルプセンターの「更新履歴」でご確認いただけます。" +
            "これまでのご意見に結果をお返しできていなかったのは追跡不足で、担当へ改めて集約済みです。"
        ),
      ],
      806,
      142
    ),
  ],
```

3箇所目、2つの角度のプロンプト（`otherTemplate` の前）。4要素は揃っています。

```javascript
// 投票用の2つの角度: タスクは同じ、入り方が違う（レッスン3の投票）
const ANGLE_PROMPTS = {
  warm: [
    "あなたはカスタマーチケットの専門担当で、一度に1件だけ扱います。この版は「まず感情を受け止める」角度を取ります。",
    "目的: まず追跡が不十分だったことを認め、そのうえでユーザーの本当の問い「まだ保守されているのか」に明確に答えること。",
    "出力フォーマット: プレーンテキストの一段落。冒頭に「チケット <チケットID> の返信:」と書き、先に謝罪と実施済みの内容を述べ、次に製品の状態に答える。箇条書きは使わない。",
    "ツール指針: このステップではシステムのツールを渡さないので、チケット原文の事実だけを使うこと。チケット履歴の具体的な件数を調べたと主張しないこと。",
    "タスクの境界: 具体的な修正日を約束せず、補償を出さず、同僚を評価しない。「お待ちください」「今しばらくお待ちください」「早急に対応します」のような中身のない言葉は書かない。",
  ].join("\n"),
  plain: [
    "あなたはカスタマーチケットの専門担当で、一度に1件だけ扱います。この版は「事実だけを述べる」角度を取ります。",
    "目的: 製品がまだ保守されているかどうかに直接答え、そのうえでこれまでのご意見を次に誰が引き取るのかを述べること。",
    "出力フォーマット: プレーンテキストの一段落。冒頭に「チケット <チケットID> の返信:」と書き、最初の文で結論を出し、続けて次の一手を述べる。箇条書きは使わず、謝罪の定型文は書かない。",
    "ツール指針: このステップではシステムのツールを渡さないので、チケット原文の事実だけを使うこと。バージョン番号を捏造しないこと。",
    "タスクの境界: 具体的な修正日を約束せず、補償を出さず、同僚を評価しない。「お待ちください」「今しばらくお待ちください」「早急に対応します」のような中身のない言葉は書かない。",
  ].join("\n"),
};
```

4箇所目、新しい関数を2つ（`fanoutNode` の前）。

```javascript
async function callAngle(ticket, angle) {
  const key = `${ticket.id}@${angle}#1`;
  const queue = SCRIPTS[key];
  if (!queue) throw new Error(`スタブの筋書きがありません: ${key}`);
  const { client, meter } = metered(makeStubClient(queue));
  const input = `チケットID ${ticket.id}\nユーザー原文: ${ticket.text}`;
  const text = await runAgent(client, ANGLE_PROMPTS[angle], input, [], {}); // 両方の角度のプロンプトが「システムのツールはない」と書いているので、ここは空の tools を渡す。routeNode と同じ形
  log({ node: "fanout", event: "vote_candidate", ticket: ticket.id, angle, chars: text.length, calls: meter.calls, tokens: meter.tokens });
  return { angle, text, calls: meter.calls, tokens: meter.tokens };
}

// 純コードの選抜: まず gate の決定的なルールで足切りし、生き残りの中から最短を選ぶ
function pickBest(ticketId, candidates) {
  const scored = candidates.map((c) => ({ ...c, gate: gateCheck(ticketId, c.text) }));
  const alive = scored.filter((c) => c.gate.pass);
  const pool = alive.length > 0 ? alive : scored; // 全滅したら全部残し、レビューノードに判定を委ねる
  const winner = pool.reduce((a, b) => (b.text.length < a.text.length ? b : a));
  return { winner, scored, allFailed: alive.length === 0 };
}
```

そして `fanoutNode` のプールのコールバックの先頭に分岐を1つ足します（`other` のテンプレート分岐はそのまま残り、T-1003 は引き続きそちらを通ります）。

```javascript
  const drafts = await runPool(routed, POOL_SIZE, async (ticket) => {
    if (VOTE_TICKETS.has(ticket.id)) {
      // 2つの角度は直列に走らせる: 並行度の上限はプールに一元化し、プールの内側でこっそり並行を開かない
      const candidates = [];
      for (const angle of ["warm", "plain"]) {
        const c = await callAngle(ticket, angle);
        calls += c.calls;
        tokens += c.tokens;
        candidates.push(c);
      }
      const { winner, scored } = pickBest(ticket.id, candidates);
      log({
        node: "fanout",
        event: "vote_pick",
        ticket: ticket.id,
        winner: winner.angle,
        detail: scored.map((c) => `${c.angle}/${c.gate.pass ? "ok" : c.gate.report}/${c.text.length}chars`).join(" | "),
      });
      console.log(
        `[vote] ${ticket.id} ` +
          scored.map((c) => `${c.angle}=${c.gate.pass ? "ok" : c.gate.report}(${c.text.length}chars)`).join("  ") +
          `  → 採用 ${winner.angle}`
      );
      return { ticket, handler: `vote:${winner.angle}`, text: winner.text };
    }
    if (ticket.category === "other") {
      const text = otherTemplate(ticket.id);
      log({ node: "fanout", event: "template_done", ticket: ticket.id });
      return { ticket, handler: "template", text };
    }
    const r = await callWorker(ticket, 1);
    calls += r.calls;
    tokens += r.tokens;
    return { ticket, handler: `worker:${ticket.category}`, text: r.text };
  });
```

実際の実行結果:

```text
\$ node orchestrate.mjs
inbox/ からチケット 6 件を受領: T-1001, T-1002, T-1003, T-1004, T-1005, T-1006
[route] T-1001=billing  T-1002=bug  T-1003=other  T-1004=billing  T-1005=bug  T-1006=other
[vote] T-1006 warm=filler_word:早急に対応します(124chars)  plain=ok(102chars)  → 採用 plain
[fanout] 並行度の上限 2、初稿 6 件を産出
[merge] out/ に 6 件を書き出し、下流へは参照と一行要約のみ渡す
[review] gate による書き直し: 合計 2 ラウンド

=== グラフ全体の実行サマリー ===
ノード    所要    モデル呼出  token    gate 回数   状態
route     62ms    1           720      -           ok
fanout    371ms   10          10827    -           ok
merge     1ms     0           0        -           ok
review    127ms   2           3033     2           ok

=== チケット別の内訳 ===
チケット カテゴリ  処理者            gate 回数   停止理由        状態
T-1001   billing   worker:billing    0           gate_pass       pass
T-1002   bug       worker:bug        0           gate_pass       pass
T-1003   other     template          0           gate_pass       pass
T-1004   billing   worker:billing    1           no_progress     needs_human
T-1005   bug       worker:bug        1           gate_pass       pass
T-1006   other     vote:plain        0           gate_pass       pass

出力ディレクトリ out/: 6 件の返信；人手での引き継ぎが必要: 1 件
  - T-1004 (no_progress): チケット T-1004: 宛名を個人から会社…
トレース: run-state.json / run.jsonl (run_id=run-mta4ffwe)
```

ベース版と比べると、`fanout` のモデル呼び出しは 8 から 10 に、token は 8903 から 10827 に、所要時間は 247ms から 371ms に増えました——これが投票の値段で、同じチケットの仕事を2回やったからです。チケット別の表では T-1006 の処理者が `template` から `vote:plain` に変わっています。

今回は1つ目のルールが勝負を決めました。`warm` の版に「早急に対応します」があり、禁止語に当たって即失格になったので、長さのルールは出番すらありませんでした。長さのルールが働くところを見たければ、スタブの `T-1006@warm#1` から「早急に対応します。」の一文を削ってもう一度走らせてください。実際の出力はこうなります。

```text
[vote] T-1006 warm=ok(115chars)  plain=ok(102chars)  → 採用 plain
```

両方の版が決定的なチェックを通ったので、2つ目のルールで短いほうを選び、`plain` が 102 文字対 115 文字で勝ちます。

**なぜ純コードの比較を使い、モデルに判定させないのか。** この2つのルールがそもそも決定的に判定できるものだからです。「禁止語があるかないか」「どちらの版が短いか」——この種の問いは文字列操作1行で答えが出て、同じ入力なら永遠に同じ結果で、呼び出しを1回も消費せず、ネットワークの待ちも1つも増やさず、新しい非決定性も持ち込みません。コース10の階層的な判定が言っているのはまさにこの順序です。決定的に判定できるものを先に判定し、残ったものがジャッジの番になる。逆にいえば、比較の基準が「どちらの版の語調のほうが、人はやり取りを続けたくなるか」になれば、それはたしかにルールに書き下せないのでジャッジに相談すべきです。しかしそのときでも、ジャッジはこの2つの決定的なルールの後ろに並ぶべきです——先に明らかに不適格な候補を落とし、残ったものに金を払って判定させるのです。

ついでに1つ、踏みやすい落とし穴を。2つの角度は直列に走らせています。楽をしようと `Promise.all` で書くと、プールの中で同時に飛んでいるモデル呼び出しが `POOL_SIZE × 2` になり、上限 2 のつもりが実際には 4 になります。ここのように直列にするか、投票の候補もプールのタスクとして同じプールのスケジューリングに委ねるか、どちらかにしてください——いずれにせよ、上限を言える場所は1つだけであるべきです。

<!-- hint -->
まず投票とセクショニングの違いをはっきりさせてください。セクショニングは1つのものを断片に切り、各断片が一部だけをやります。投票は同じものを丸ごと2回やり、入り方だけが違い、最後に1つを選ばなければなりません。ですから2つの角度のプロンプトは、「目的」の行は同じことを言うべきで、違うのは入り方、何から先に言うかです。

<!-- hint -->
選抜のためにルールをもう一式書かないでください——`gateCheck` はもうあるので、それをそのまま1つ目のふるいにし、2つの候補を1回ずつ通して、どちらの `pass` が `true` かを見ます。残る作業は「生き残りの中から最短を選ぶ」という `reduce` 一文だけです。実際に1回走らせて、ターミナルのあの `[vote]` の行が2つの候補それぞれの状態をどう印字したかを見れば、今回どちらのルールが働いたか分かります。

<!-- /exercises -->

## まとめ

- 4つのパターンを1つのファイルに溶接しました（投票は演習で5つ目として補い、オーケストレーター・ワーカーは振り分けが事前定義できるため意図的に不在）。「計画がコードにある」という言明には具体的な形があります。`main()` の十数行がすべて制御フローで、`routed` / `drafts` / `items` という3つのただの変数がすべて状態です。LLM とツールは事前定義されたコード経路を通じてオーケストレーションされ[^S1]、スクリプト自体がループ、分岐、中間結果を保持し、モデルのコンテキストはそのステップに必要なものだけを保持します[^S5]
- すべてのノードがモデルである必要はありません。5つのノードのうちモデルを呼ぶのは2つで、`merge`、`report`、gate の第一フィルタはすべて純コード、`other` カテゴリは文字列テンプレートを通ります。決定的なコードが同じ答えを出せるところで、呼び出し1回分の金とレイテンシを払う理由はありません
- ルーティングの価値はあの呼び出しにあるのではなく、呼び出しのあとの十行の締め付けコードにあります。モデルの自由なテキストが3つの正当なラベルのどれかに押し込まれ、下流の分岐はコードが検証済みの値しか認識しません。専門化されたプロンプトは、分類が買った配当です[^S1]
- ファンアウトの並行度には上限が要り、合流はペイロードではなく参照を渡さなければなりません——出力はディスクに落とし、下流には軽量な参照だけを渡し[^S2]、レビューノードは自分でファイルから読み戻します。同期のファンアウトはこの規模なら痛みませんが、規模が大きくなればボトルネックになります[^S2]。非同期に変えるなら3つの代償を払わなければなりません。結果の調整、状態の一貫性、サブエージェントをまたぐエラーの伝播です[^S2]
- レビュー回路は検査・修正・再検査で、通過するか、これ以上進展しなくなるまで回り[^S5]、そこに最大ラウンド数の安全網が加わります[^S1]。決定的な gate はジャッジより前に並びます。「2ラウンド連続で同じレポート」という基準は最大ラウンド数より早く損切りでき、しかも返す結論の情報量が多い——「3回試してもだめだった」ではなく、「このフィードバックを理解していない」です
- 逐次のトレースが復旧可能性をもたらします。各ノードの完了ごとに1回永続化することが、まさに同じセッション内で実行を継続できる前提です[^S5]（プロセスやマシンをまたぐ継続は、状態をディスクに永続化した本レッスンが自前で足した一段の格上げです）。これを `.tmp` に書いてから `rename` する原子的な差し替えと組み合わせれば、どの瞬間に殺されてもディスクには読み戻せる完全な状態が1つあります
- このグラフが面倒を見るのは、1プロセス、1バッチのチケット、ステップが確定した仕事です。ステップを予測できないオープンエンドな問題は自律的なループに戻すべきです[^S1]。複雑さを1層足すたびに「測定可能な改善」というゲートを通さなければなりません[^S1]

12レッスンはここで完結です。

振り返れば、いま手元にあるものは1つずつ積み上げてきたものです。コース1（Claude Code Skills: 自分専用の AI ワークフローを作る）で最初のプロンプトを書き、要求をはっきり述べることを学びました。それからツール呼び出し、ワークフロー、スキル、マルチエージェントコラボレーションと来て、コース7に至ります——あのコースは自分の手でループを書かせました。`while (response.stop_reason === "tool_use")`。その日からエージェントはあなたにとってブラックボックスではなく、読めるコードの一片になりました。コース8（コンテキストエンジニアリング: 有限のアテンションを効くところに使う）はそのコンテキストの管理を教え、ウィンドウが破裂するまでループを回させないようにしました。コース9は中断を生き延びさせることを教え、殺されても最後に止まった場所から続けられるようにしました。コース10は出力を検証すること、「終わったように見える」と「終わった」を分けることを教えました。コース11はその過程を見ること、壊れたときに調べられるログとトレースを持つことを教えました。そして本コースは、複数のループを、それ自身が計画を保持するグラフに組み上げることを教えました。

この6つは1つのことの6つの面です。**自分が書いたコードの中で、非決定的なものを制御している**、ということです。ループはあなたが書いたもの、コンテキストはあなたが管理するもの、チェックポイントはあなたのセーブ、受け入れ基準はあなたの定義、ログはあなたの print、計画はあなたの段取りです。モデルは非常に強力ですが、あなたが組んだこの制御コードの中で働いています。

最後の一歩は具体的な行動に着地します。`orchestrate.mjs` の `makeStubClient(queue)` を `new Anthropic()` に差し替え、`SCRIPTS` の表を削除し、コース7の移っていない3つのバルブを戻し、そして自分の仕事で実際に積み上がっている一群のタスク——本物のチケット、本物のログ、本物の todo——を `inbox/` に放り込んで、初回を走らせてください。おそらく何件かが `needs_human` に落ちるはずです。それこそが、このグラフのあるべき姿です。

