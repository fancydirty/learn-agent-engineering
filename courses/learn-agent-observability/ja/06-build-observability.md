# レッスン6: 実践: ハーネスに観測レイヤーを組み込む

> 学習目標:
> - 自分のハーネスに、動く観測レイヤーを組み込む: JSON Lines の構造化ログ、ログから再構築するトレースツリー、1行のメトリクスサマリー
> - 実際の誤りタスクを、症状 → 絞り込み → 最初の分岐点 → 修正 → 再実行の比較まで歩き切る（モデル側はスタブで固定して丸ごと再実行する。実 API に繋いだら失敗地点からの復帰に戻る）。そして、どの不条理が原因でどれが伝播かを説明できる
> - この観測レイヤーの境界を引く: 1プロセス、1回の実行を対象とする。内容の記録はデフォルトでオフ。しきい値はでっち上げない
>
> 前提: レッスン1〜5を完了し、第7コース（エージェントハーネスの基礎: ループと制御）のハーネスループが動く状態で手元にあること | 前: [レッスン5 <<](./05-hooks-and-debugging.md)

## 症状: summary.md に存在しない地域が1つ増えている

まずは、机の上で匂いを嗅げるくらい具体的な場面から始めます。

週報を処理する小さなエージェントを書きました。`data/` ディレクトリに四半期の売上 CSV が3つ入っていて、それを読み、地域ごとに集計し、`summary.md` を書き出します。ツールは3つ、`list_files`、`read_file`、`write_file` です。数週間、問題なく動いていました。

月曜の朝、同僚がチャットで聞いてきます。「この Central China っていう地域、どこから出てきたんですか。うちに Central China という地域はありませんよ」。

`summary.md` を開くと、確かにこうなっています。

```text
# 2026年Q1 地域別売上サマリー

| 地域 | 合計 (¥) |
| --- | --- |
| East China | 548550 |
| Central China | 208000 |
| North China | 432600 |
| 総計 | 1189150 |

データソース: data/ ディレクトリの CSV ファイル
```

`data/` を開くと、中には3つのファイル、`2026-q1-east.csv`、`2026-q1-south.csv`、`2026-q1-north.csv` があり、中身の地域名は East China、South China、North China です。ディレクトリ全体を「Central China」で全文検索しても、ヒットはゼロ。South China は跡形もなく消え、Central China はどこからともなく現れ、208000 という数字も出所不明です。

いま問うべきは、**どのステップで間違えたのか**です。

観測レイヤーがなければ、あなたの手元には2つしかありません。誤って書かれた `summary.md` と、「モデルが作り話をした」という一言です。この一言は何も解決しません。そもそもファイルを読めなかったのか、読んだが計算を間違えたのか、3つとも読んだが書くときに行を取り違えたのか、分かりません。しかも「ブレークポイントを置いて再現すれば」と押し出すこともできません。エージェントは実行間で非決定的で、同じプロンプトと同じツールでも、まったく別の、しかし同じくらい妥当な経路を通るかもしれません[^S1]。3回走らせて3回とも成功するかもしれませんし、4回目に新しい壊れ方をするかもしれません。

さらに悪いことに、エラーは積み重なります。1つのステップの失敗がエージェントをまったく別の軌道へ逸らし、最終結果は元の小さな不具合とは無関係に見えるようになります[^S1]。だから終点をにらんでいるだけではだめです。終点の不条理はたいてい**伝播**にすぎず（レッスン1ではこれを軌道の逸脱と呼びました。同じことです）、本当の病巣は上流のどこかのステップにあります。

このレッスンの仕事は、「言えない」を「確認できる」に変えることです。ハーネスに観測レイヤーをはんだ付けし、この実際のバグを一度歩いて特定します。前の5つのレッスンのすべてが、1つの実行可能なファイルに着地します。

## 観測3点セット: 何を記録するか

本番でエージェントを動かすとき、見えている必要があるのは4つです。どのツールを呼んだか、各モデルリクエストにどれだけかかったか、トークンをどれだけ使ったか、どこで失敗したか[^S6]。公式のやり方はこれらを OpenTelemetry のトレース、メトリクス、ログイベントとしてエクスポートすることですが、このレッスンでは OTel のライブラリは一切持ち込まず、最小構成を手で作ります。3点です。

1. **構造化ログ**: モデルリクエストごとに1行、ツール呼び出しごとに1行の JSON Lines を `run.log.jsonl` に書きます。
2. **トレースツリー**: 実行が終わった後、その JSONL から親子関係を再構築し、インデントして表示します。
3. **メトリクスサマリー**: 総ラウンド数、ツール呼び出し回数、トークン、エラー数、総所要時間を1行で出力します。

### スパンモデル: 誰が誰の親か

公式で拡張テレメトリを有効にすると、エージェントループの各ステップが調べられるスパンになります。1回の interaction がルートスパンで、モデルリクエストとツール実行がその子スパンです[^S6]。ここで注意してほしいのは、公式のツリーではモデルリクエストとツール呼び出しがルートの下で**同列の兄弟**である点です。レッスン4で再構築したツリーはこの形をしています。私たちの最小版はあえて別のぶら下げ方を採ります。ツール呼び出しを**それを引き起こしたモデルリクエスト**の下にぶら下げるので、ツリーの形がそのまま「モデルはこのラウンドで何をしたかったのか」を示し、同じ親の下に並ぶ並列ツールが一目で見えます。親子のしくみはまったく同じで、ツールの親を別のものに選んだだけです。どちらのぶら下げ方も妥当で、どちらを選ぶかはツリーに最初に答えてほしい問いによります。私たちの3層はこうなります。

```text
agent_run                 ← 1回の実行、ルート記録
├─ model_call turn-1      ← 1回の messages.create
│  └─ tool_call ...       ← このモデルリクエストから出たツール呼び出し
├─ model_call turn-2
│  ├─ tool_call ...       ← 同じラウンドで並列に要求された複数のツールは兄弟になる
│  ├─ tool_call ...
│  └─ tool_call ...
└─ model_call turn-3
```

親子関係はメモリ上のコールスタックに頼りません。ログの2つのフィールドに頼ります。各記録が `span_id` を持ち、それに加えて親を指す `parent_id` を持ちます。ツリーは**実行が終わった後にディスク上の JSONL から再構築**されるもので、走りながら表示されるものではありません。この点が効いてきます。ツリーに見えるものはすべて、まずログに記録されている必要があります。ツリーに何かが欠けているなら、それは表示コードの問題ではなく、記録コードの問題です。

### フィールド表

以下のフィールド設計はこのレッスンのエンジニアリング上の選択であって、公式の仕様ではありません。公式のものは OTel のスパン属性名ですし、自分でハーネスを書くならフィールド名はあなた次第です。レッスン3と4から4つの名前が変わっているので、誤記だと思われないよう先に対応づけておきます。レッスン3の `type` はここでは `kind` と呼びます（当時は記録の種類が2つだけでしたが、いまは `agent_run` があるので、意味の広い語のほうが収まります）。`input_tokens`/`output_tokens` は `tokens:{input,output}` というオブジェクトにまとめます（モデル呼び出し固有のものを1か所に packing します）。`tool_response` はここでは `tool_result` と呼びます（hook のペイロードは response と呼びますが、ここでの戻り値はツールの実装から直接来るので、API のコンテンツブロックの命名に合わせます）。レッスン4の `parent_span_id` は `parent_id` に短縮しました。コストも述べておきます。レッスン3の `stats.mjs` はこのログを読むのにフィールド名を2か所変える必要があります。これは「きれいな命名よりも語彙をそろえることのほうが大事だ」という実演です。フィールドの**語彙**そのものは公式資料と合わせておく価値があります。いずれバックエンドに繋ぐときに、概念を入れ替えずに綴りを入れ替えるだけで済むからです。

| フィールド | 中身 | なぜ必要か |
| --- | --- | --- |
| `ts` | ISO タイムスタンプ | 並べ替え、時刻の突き合わせ。プロセスをまたいで合わせられる唯一のもの |
| `trace_id` | 1回の実行に1つ | 散らばった行を同じ実行に結び戻す |
| `span_id` / `parent_id` | この記録の id / 親記録の id | ツリーを再構築する。「誰が誰の下か」を認識するのはこれ頼み |
| `kind` | `model_call` / `tool_call` / `agent_run` | 絞り込むとき最初に使うフィールド |
| `name` | `turn-2` / `read_file` | 人間の目が最初に見るもの |
| `duration_ms` | このステップにかかった時間 | 性能のボトルネックを探す。「詰まっていないか」を見るのにも使う |
| `tokens` | モデル呼び出しの in / out | 公式のデータでは、トークン使用量そのものが単独でもっとも強い説明変数です[^S1] |
| `tool_input` / `tool_result` | 形状 + 長さ + 切り詰めた抜粋 | 「パラメータは正しいか」「戻り値は空か」を判断する |
| `error` | エラーメッセージの抜粋。なければ `null` | 特定するとき最初に絞り込むフィールド |

`trace_id` の手は公式から学んだものです。1つのユーザープロンプトがいくつもの API 呼び出しといくつものツールを引き起こすので、公式は `prompt.id` 属性を使ってそれらすべてを引き金のプロンプトへ結び戻します。公式のトレースのやり方も直接的で、1つのプロンプトが引き起こしたすべてのアクティビティを追跡するには、特定の `prompt.id` の値でイベントをフィルタします[^S4]。ここでは `trace_id` を使います。1回の実行が1つのタスクなので `trace_id` を使いますが、やっていることはまったく同じです。ついでに言うと、ここには `session_id` がありません。このスクリプトの1回の実行が1セッションなので、このフィールドを残しても意味がないからです。複数ラウンド・複数セッションの場面では足し直してください。語彙はレッスン3を参照してください。

メトリクスの行も適当に選んだわけではありません。公式は最終的な正確さに加えて、個々のツール呼び出しとタスク全体の総実行時間、ツール呼び出しの総回数、トークンの総消費量、ツールのエラーを収集することを推奨しています[^S3]。この4つは、サマリー行と各記録の `duration_ms` に着地場所があります。`rounds` は私が足した5つ目の数字で、ループを何周したかを一目で見るのに便利です。この公式のセットは第10コース（検証と品質保証: 「正しく見える」を通すな）ですでに使いました。あちらでは採点のため、ここでは診断のため、同じ物差しです。

### 内容をどこまで記録するか: このレッスンで唯一あなた自身に引いてもらう線

`tool_input` と `tool_result` は、CSV 1本まるごとかもしれませんし、ユーザー入力の全文かもしれませんし、書き出したドキュメントの全文かもしれません。全部記録するのは技術的には1行の変更ですが、デフォルトではそうすべきではありません。

公式のテレメトリのデフォルトの姿勢は明快です。**構造的なものは常に記録し、内容は記録しない**——所要時間、モデル名、ツール名はすべてのスパンに記録され、トークン数は API が使用量を返したときに記録される一方、エージェントが読み書きした内容はデフォルトでは収集されません[^S6]。ユーザープロンプトも同じで、デフォルトでは長さだけを記録し、内容を記録するには別の環境変数が必要です[^S4]。そして公式はこの種のスイッチに、はっきりした一文を添えています。あなたの観測パイプラインが、エージェントの扱うデータを保存してよいと承認されていない限り、これらは未設定のままにしておきなさい[^S6]。

私たちのレイヤーは折衷案を残します。デフォルトでは `shape`（文字列かオブジェクトか、どれくらいの長さか、どんなキーがあるか）、`chars`（文字数）、それに先頭60文字の抜粋をヘッド要約として記録します。抜粋があるのは、自分でデバッグするときに「今回はどのファイルを読んだのか」を一目で認識でき、何度も走らせ直さずに済むからです。コード中の `HEAD_CHARS = 60` がこの線の位置で、`0` にすれば内容は1文字もディスクに落ちません。自分のプロジェクトでこの線をどこに引くかは、ログがどこに着地するのか、誰が見られるのか、データの承認が通っているのかによります。これは技術の問題ではなく、コンプライアンスの問題です。

## 検証のしかけ: 3つのバージョンの差分をどこに固定したか

このレッスンでは3回走らせます。正常なもの、バグ入り、修正後です。3つの出力は行単位で比較できる必要があるので、**モデルのレスポンスを本物にはできません**。本物のモデルのレスポンスは毎回違い、それでは特定のしかたを教えられません。このシリーズの第8〜10コースと同じやり方に従います。**固定レスポンスキューを持つスタブクライアント**です。`client.messages.create()` はネットワークリクエストを送らず、配列に書いておいたレスポンスオブジェクトを順に返します。各オブジェクトは完全な `stop_reason`、`content`、`usage` を持ちます。ハーネスのループは一言も変わりません。受け取るものは、実クライアントが返すものと形が同一です。

3つのバージョンの差分はすべて、コード中の `VERSIONS` テーブルに固定してあります。各バージョンが持つのは2つです。

| バージョン | レスポンスキュー | `read_file` のエラーメッセージ | 結果 |
| --- | --- | --- | --- |
| `v-good` | CSV 3本を正しく読む | 不透明な版 | `summary.md` が正しい |
| `v-bug` | 2本目のファイル名を `sourth` と打ち間違える | 不透明な版 | Central China 地域をでっち上げた |
| `v-fixed` | 同じ `sourth` の打ち間違い | 実行可能な助言つきの版 | 正しい |

このテーブル以外、**残りのコードは3バージョンで完全に共通**です。ツールは本当にディスクを読み書きします。`list_files` は本当に `readdirSync` し、`read_file` は本当にファイルを読み、ファイルが存在しないから本当に throw し、`write_file` は本当に `summary.md` をディスクに書きます。ですから `v-bug` のあのエラーは偽装したエラーオブジェクトではなく、ファイルシステムが本当にそのファイルを見つけられなかった結果です。

はっきりさせておきます。スタブが解決するのは「モデル側が再現可能になる」ことであって、「エージェントが決定的になる」ことではありません。実際に走らせれば、同じプロンプトを2回投げても別のツールを選び、別の経路を通るかもしれません[^S1]。この観測レイヤーの価値はまさにそこにあります。経路は毎回違っても、毎回見返せる記録が残ります。

はっきり述べておくべきこと。スタブはモデル側を固定するので丸ごとの再実行が成立します。実 API では失敗地点からの復帰に戻ってください。このレッスンが丸ごとの再実行に踏み切れるのは、まさにモデル側がスタブで固定されているからです。再実行が新しい変数を持ち込まないので、行単位の比較が成立します。実 API に繋げばスタブはなくなるので、レッスン5のやり方、すなわち失敗地点からの復帰に戻ります。

## 完全なコード: observed-agent.mjs

ファイル1つ、依存ゼロ、素の `node` で走ります。`observed-agent.mjs` として保存し、`node observed-agent.mjs --version v-bug` で実行します。

```javascript
#!/usr/bin/env node
// observed-agent.mjs —— ハーネスに観測レイヤーを組み込む（構造化ログ + トレースツリー + メトリクスサマリー）
// 使い方: node observed-agent.mjs --version v-good|v-bug|v-fixed
// 依存ゼロ、素の node で走る。モデル呼び出しは固定レスポンスキューのスタブクライアントが駆動し、3バージョンの差分は下の VERSIONS テーブルにある。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 4096;
const MAX_ROUNDS = 12;      // ループの上限。超えたら暴走とみなし、非ゼロで終了する
const HEAD_CHARS = 60;      // ログに残す内容抜粋の最大文字数。0 にすれば1文字も記録しない

// ============ 1. 対象タスク: data/ から売上 CSV を数本読み、地域ごとに集計して summary.md を書く ============

const CSV_FILES = {
  "2026-q1-east.csv":
    "region,month,amount\nEast China,2026-01,182400\nEast China,2026-02,161250\nEast China,2026-03,204900\n",
  "2026-q1-south.csv":
    "region,month,amount\nSouth China,2026-01,97300\nSouth China,2026-02,88600\nSouth China,2026-03,120450\n",
  "2026-q1-north.csv":
    "region,month,amount\nNorth China,2026-01,143000\nNorth China,2026-02,150700\nNorth China,2026-03,138900\n",
};

function setupWorkspace(root) {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  for (const [name, body] of Object.entries(CSV_FILES)) {
    fs.writeFileSync(path.join(root, "data", name), body);
  }
}

// ============ 2. 3つのツール（本当にディスクを読み書きし、エラーも本物のエラー） ============

const tools = [
  {
    name: "list_files",
    description: "ディレクトリ内のファイル名を辞書順にソートし、1行に1件で返す。",
    input_schema: {
      type: "object",
      properties: { dir: { type: "string", description: "作業ディレクトリからの相対パス。例: data" } },
      required: ["dir"],
    },
  },
  {
    name: "read_file",
    description: "パスを指定してテキストファイルを読み、全文を返す。パスは list_files が返した元のファイル名を使うこと。",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "作業ディレクトリからの相対ファイルパス" } },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "指定したパスにテキストを書き込む。同名のファイルは上書きする。",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "作業ディレクトリからの相対ファイルパス" },
        content: { type: "string", description: "書き込む完全なテキスト" },
      },
      required: ["path", "content"],
    },
  },
];

function resolveInRoot(root, p) {
  const abs = path.resolve(root, p);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error(`パスが境界の外に出ています。アクセスを拒否します: ${p}`);
  }
  return abs;
}

const impls = {
  list_files({ dir }, ctx) {
    const abs = resolveInRoot(ctx.root, dir);
    return fs.readdirSync(abs).sort().join("\n");
  },
  read_file({ path: p }, ctx) {
    const abs = resolveInRoot(ctx.root, p);
    if (fs.existsSync(abs)) return fs.readFileSync(abs, "utf8");
    // 同じ「ファイルが存在しない」に対して、2種類の文面。v-fixed は実行可能な助言つきのほうを使う。
    if (ctx.errorStyle === "actionable") {
      const available = fs
        .readdirSync(path.join(ctx.root, "data"))
        .sort()
        .map((f) => `data/${f}`)
        .join(", ");
      throw new Error(
        `ファイル ${p} が見つかりません。現在 data/ にあるのは: ${available}。` +
          `list_files が返した元のファイル名でリトライしてください。必要なデータが本当に存在しないなら、` +
          `処理を止めて、どのファイルが足りないかをユーザーに伝えてください。欠けている数字を自分で見積もらないでください。`
      );
    }
    throw new Error(`ENOENT: no such file or directory, open '${p}'`);
  },
  write_file({ path: p, content }, ctx) {
    const abs = resolveInRoot(ctx.root, p);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    return `${p} を書き込みました（${content.length} 文字）`;
  },
};

// ============ 3. スタブクライアント: 固定レスポンスキュー ============

const SUMMARY_CORRECT = `# 2026年Q1 地域別売上サマリー

| 地域 | 合計 (¥) |
| --- | --- |
| East China | 548550 |
| South China | 306350 |
| North China | 432600 |
| 総計 | 1287500 |

データソース: data/2026-q1-east.csv, data/2026-q1-south.csv, data/2026-q1-north.csv
`;

const SUMMARY_FABRICATED = `# 2026年Q1 地域別売上サマリー

| 地域 | 合計 (¥) |
| --- | --- |
| East China | 548550 |
| Central China | 208000 |
| North China | 432600 |
| 総計 | 1189150 |

データソース: data/ ディレクトリの CSV ファイル
`;

const say = (text) => ({ type: "text", text });
const call = (id, name, input) => ({ type: "tool_use", id, name, input });
const turn = (stop_reason, content, input_tokens, output_tokens) => ({
  id: `msg_stub_${crypto.randomBytes(3).toString("hex")}`,
  model: MODEL,
  stop_reason,
  content,
  usage: { input_tokens, output_tokens },
});

const READ_EAST = call("toolu_e", "read_file", { path: "data/2026-q1-east.csv" });
const READ_NORTH = call("toolu_n", "read_file", { path: "data/2026-q1-north.csv" });
const READ_SOUTH = call("toolu_s", "read_file", { path: "data/2026-q1-south.csv" });
const READ_TYPO = call("toolu_x", "read_file", { path: "data/2026-q1-sourth.csv" });

const VERSIONS = {
  // 順風満帆: CSV 3本とも読めて、集計も正しい。
  "v-good": {
    errorStyle: "opaque",
    queue: [
      turn("tool_use", [say("まず data/ に何のファイルがあるか見ます。"), call("toolu_l", "list_files", { dir: "data" })], 812, 96),
      turn("tool_use", [say("地域別の CSV が3本あるので、まとめて読みます。"), READ_EAST, READ_SOUTH, READ_NORTH], 946, 218),
      turn("tool_use", [say("3地域とも揃ったので、集計を書き出します。"), call("toolu_w", "write_file", { path: "summary.md", content: SUMMARY_CORRECT })], 1584, 342),
      turn("end_turn", [say("summary.md を書き出しました: East China 548550、South China 306350、North China 432600、合計 1287500。")], 1961, 74),
    ],
  },
  // バグ版: 2本目の CSV のファイル名を打ち間違え、ツールは不透明なエラーを返し、モデルは止まらずに地域をでっち上げて書き進める。
  "v-bug": {
    errorStyle: "opaque",
    queue: [
      turn("tool_use", [say("まず data/ に何のファイルがあるか見ます。"), call("toolu_l", "list_files", { dir: "data" })], 812, 96),
      turn("tool_use", [say("地域別の CSV が3本あるので、まとめて読みます。"), READ_EAST, READ_TYPO, READ_NORTH], 946, 218),
      turn("tool_use", [say("データは揃ったので、集計を書き出します。"), call("toolu_w", "write_file", { path: "summary.md", content: SUMMARY_FABRICATED })], 1602, 355),
      turn("end_turn", [say("summary.md を書き出しました: East China 548550、Central China 208000、North China 432600、合計 1189150。")], 1990, 81),
    ],
  },
  // 修正版: 打ち間違いは同じだが、エラーメッセージを実行可能な助言つきに差し替えたので、モデルはでっち上げずにリトライする。
  "v-fixed": {
    errorStyle: "actionable",
    queue: [
      turn("tool_use", [say("まず data/ に何のファイルがあるか見ます。"), call("toolu_l", "list_files", { dir: "data" })], 812, 96),
      turn("tool_use", [say("地域別の CSV が3本あるので、まとめて読みます。"), READ_EAST, READ_TYPO, READ_NORTH], 946, 218),
      turn("tool_use", [say("ファイル名を sourth と打ち間違えていました。エラーメッセージにある元のファイル名で読み直します。"), READ_SOUTH], 1688, 64),
      turn("tool_use", [say("3地域とも揃ったので、集計を書き出します。"), call("toolu_w", "write_file", { path: "summary.md", content: SUMMARY_CORRECT })], 1849, 342),
      turn("end_turn", [say("summary.md を書き出しました: East China 548550、South China 306350、North China 432600、合計 1287500。補足: 最初にファイル名を data/2026-q1-sourth.csv と打ち間違えたので、list_files が返した元の名前でリトライしました。data/ の外に他の地域のデータがあるなら、どこにファイルがあるか教えてください。数字を自分で埋めることはしません。")], 2226, 118),
    ],
  },
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
          const err = new Error(`スタブキューを使い切りました: ${i + 1} 回目のリクエストに対応する事前定義レスポンスがありません`);
          err.code = "STUB_QUEUE_EXHAUSTED";
          throw err;
        }
        return queue[i++];
      },
    },
  };
}

// ============ 4. 観測レイヤーその1: 構造化ログ（JSON Lines） ============

const newId = (prefix) => `${prefix}-${crypto.randomBytes(4).toString("hex")}`;

function shapeOf(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === "string") return `string(${value.length})`;
  if (typeof value === "object") return `object{${Object.keys(value).join(",")}}`;
  return typeof value;
}

// デフォルトでは形状 + 長さ + 先頭 HEAD_CHARS 文字の抜粋だけを記録し、全文は記録しない。
function summarize(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  const out = { shape: shapeOf(value), chars: text.length };
  if (HEAD_CHARS > 0) {
    const flat = text.replace(/\s+/g, " ").trim();
    out.head = flat.length > HEAD_CHARS ? `${flat.slice(0, HEAD_CHARS)}…` : flat;
  }
  return out;
}

function createLogger(logPath, traceId) {
  fs.writeFileSync(logPath, "");
  return {
    record(fields) {
      const line = { ts: new Date().toISOString(), trace_id: traceId, ...fields };
      fs.appendFileSync(logPath, `${JSON.stringify(line)}\n`);
    },
  };
}

// ============ 5. 観測レイヤーその2: JSONL からトレースツリーを再構築する ============

function buildTree(records) {
  const byId = new Map(records.map((r) => [r.span_id, { ...r, children: [] }]));
  const roots = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);

function labelOf(n) {
  const name = n.name.padEnd(13);
  const dur = `${String(n.duration_ms).padStart(3)}ms`;
  if (n.kind === "agent_run") return `agent_run  ${name}${dur}  trace_id=${n.trace_id}`;
  if (n.kind === "model_call") {
    const t = n.tokens;
    return `model_call ${name}${dur}  in=${t.input} out=${t.output}  stop=${n.stop_reason}`;
  }
  if (n.kind === "harness_error") return `harness_err ${name}${dur}  ${n.error.head ?? n.error.shape}`;
  const inHead = clip(n.tool_input.head ?? n.tool_input.shape, 34);
  const out = n.error ? `ERROR ${clip(n.error.head ?? n.error.shape, 44)}` : `ok ${n.tool_result.shape}`;
  return `tool_call  ${name}${dur}  in=${inHead}  ${out}`;
}

function renderTree(nodes, prefix, lines) {
  nodes.forEach((node, idx) => {
    const last = idx === nodes.length - 1;
    lines.push(prefix === null ? labelOf(node) : `${prefix}${last ? "└─ " : "├─ "}${labelOf(node)}`);
    const childPrefix = prefix === null ? "" : `${prefix}${last ? "   " : "│  "}`;
    renderTree(node.children, childPrefix, lines);
  });
  return lines;
}

// ============ 6. 観測レイヤーその3: メトリクスサマリー ============

function metricsOf(records) {
  const model = records.filter((r) => r.kind === "model_call");
  const tool = records.filter((r) => r.kind === "tool_call");
  const root = records.find((r) => r.kind === "agent_run");
  return {
    // このハーネスでは1ラウンド = 1回のモデルリクエストなので、rounds はそのまま model_calls を取る。
    // スタブキューを使い切って harness_error を投げた場合、最後のラウンドには対応する model_call がない——その実行ではこの2つの数字が1つずれる
    rounds: model.length,
    model_calls: model.length,
    tool_calls: tool.length,
    errors: records.filter((r) => r.error).length,
    tokens_in: model.reduce((s, r) => s + r.tokens.input, 0),
    tokens_out: model.reduce((s, r) => s + r.tokens.output, 0),
    wall_ms: root ? root.duration_ms : 0,
  };
}

// ============ 7. 観測されるハーネスループ ============

async function runToolUses(content, ctx) {
  const results = [];
  for (const block of content) {
    if (block.type !== "tool_use") continue;
    const spanId = newId("span");
    const startedAt = Date.now();
    const base = {
      span_id: spanId,
      parent_id: ctx.parentId,
      kind: "tool_call",
      name: block.name,
      tool_input: summarize(block.input),
    };
    try {
      const impl = impls[block.name];
      if (!impl) throw new Error(`未知のツール: ${block.name}`);
      const result = impl(block.input, ctx);
      ctx.log.record({ ...base, duration_ms: Date.now() - startedAt, tool_result: summarize(result), error: null });
      results.push({ type: "tool_result", tool_use_id: block.id, content: result });
    } catch (e) {
      ctx.log.record({ ...base, duration_ms: Date.now() - startedAt, tool_result: null, error: summarize(e.message) });
      results.push({ type: "tool_result", tool_use_id: block.id, content: e.message, is_error: true });
    }
  }
  return results;
}

async function main() {
  const argv = process.argv.slice(2);
  const version = argv[argv.indexOf("--version") + 1];
  if (!argv.includes("--version") || !VERSIONS[version]) {
    console.error("使い方: node observed-agent.mjs --version v-good|v-bug|v-fixed");
    process.exit(2);
  }

  const root = path.resolve(process.cwd(), "runs", version);
  setupWorkspace(root);

  const traceId = newId("tr");
  const log = createLogger(path.join(root, "run.log.jsonl"), traceId);
  const rootSpan = newId("span");
  const runStartedAt = Date.now();

  const { queue, errorStyle } = VERSIONS[version];
  const client = makeStubClient(queue);
  const ctx = { root, errorStyle, log, parentId: rootSpan };
  const messages = [
    {
      role: "user",
      content: "data/ ディレクトリの売上 CSV を地域ごとの合計に集計し、summary.md に書き出してください。ファイルに実在するデータだけを使ってください。",
    },
  ];

  let rounds = 0;
  let exitCode = 0;
  const callModel = async () => {
    const spanId = newId("span");
    const startedAt = Date.now();
    rounds += 1;
    const response = await client.messages.create({ model: MODEL, max_tokens: MAX_TOKENS, tools, messages });
    log.record({
      span_id: spanId,
      parent_id: rootSpan,
      kind: "model_call",
      name: `turn-${rounds}`,
      duration_ms: Date.now() - startedAt,
      stop_reason: response.stop_reason,
      tokens: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      error: null,
    });
    ctx.parentId = spanId;
    return response;
  };

  try {
    let response = await callModel();
    while (response.stop_reason === "tool_use") {
      if (rounds >= MAX_ROUNDS) throw new Error(`MAX_ROUNDS=${MAX_ROUNDS} を超過しました。暴走と判断します`);
      messages.push({ role: "assistant", content: response.content });
      const toolResults = await runToolUses(response.content, ctx);
      messages.push({ role: "user", content: toolResults });
      response = await callModel();
    }
  } catch (e) {
    log.record({
      span_id: newId("span"),
      parent_id: rootSpan,
      kind: "harness_error",
      name: e.code ?? "harness_error",
      duration_ms: 0,
      error: summarize(e.message),
    });
    console.error(`ハーネスが中断しました: ${e.message}`);
    exitCode = 2;
  }

  log.record({
    span_id: rootSpan,
    parent_id: null,
    kind: "agent_run",
    name: "sales-summary",
    duration_ms: Date.now() - runStartedAt,
    error: null,
  });

  // 実行が終わった後、ディスク上の JSONL だけからビューを再構築する——メモリ上のコピーは数に入れない。
  const records = fs
    .readFileSync(path.join(root, "run.log.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

  const m = metricsOf(records);
  console.log(`\n=== トレースツリー（${version}、run.log.jsonl から再構築）===`);
  console.log(renderTree(buildTree(records), null, []).join("\n"));
  console.log(
    `\n=== メトリクスサマリー（${version}）===\n` +
      `rounds=${m.rounds} model_calls=${m.model_calls} tool_calls=${m.tool_calls} ` +
      `errors=${m.errors} tokens_in=${m.tokens_in} tokens_out=${m.tokens_out} ` +
      `tokens_total=${m.tokens_in + m.tokens_out} wall=${m.wall_ms}ms`
  );
  console.log(`ログ: runs/${version}/run.log.jsonl　成果物: runs/${version}/summary.md`);
  process.exit(exitCode);
}

main();
```

いくつか個別に取り上げる価値のある点があります。

- **ループ自体は変わっていません。** 第7コース（エージェントハーネスの基礎: ループと制御）のあの `while (response.stop_reason === "tool_use")` は一言も動いていません。観測は外側に巻いてあります。`callModel()` はリクエストの前後でタイムスタンプを1つずつ記録し、`runToolUses()` は各ツールブロックの外側に try/catch とタイマーを1枚かぶせただけです。この2つのラッパーを剥がせば、残るのは元のループです。
- **`MAX_ROUNDS` は硬い関所です。** エージェントには停止条件、たとえば最大反復回数が必要で、これは制御の一部です[^S2]。超えたらエラーを投げ、`harness_error` を記録し、終了コードは2です。
- **終了コードの分担。** このスクリプトは実行と記録だけを担い、実行が終われば0、パラメータの誤りか暴走なら非ゼロです。「出力が正しいか」は第10コース（検証と品質保証: 「正しく見える」を通すな）の検証スイートの仕事です。`v-bug` も0で終了する点に注意してください。ハーネスは滞りなく終わったと思っています。検証は壊れたかどうかを教え、このレイヤーはなぜかを教えます。
- **ツールのエラーはループを壊しません。** エラーは `is_error: true` の `tool_result` に包まれてモデルへ戻され、ループは続きます。これは正しい動作です。エージェントは進捗を評価するために、各ステップで環境からグラウンドトゥルースを得る必要があり[^S2]、エラーもまたフィードバックだからです。このレッスンのバグは丸ごと、その文の後半で起きています。フィードバックは与えられた、しかし与え方が粗末すぎた、ということです。

## まず順風満帆を1回: v-good

正常な姿を先に見ておきます。以下のターミナル出力と、これ以降のすべてのターミナル出力は**本当に実行したもので、手書きの例ではありません**。

```text
$ node observed-agent.mjs --version v-good

=== トレースツリー（v-good、run.log.jsonl から再構築）===
agent_run  sales-summary  1ms  trace_id=tr-7f2cc208
├─ model_call turn-1         0ms  in=812 out=96  stop=tool_use
│  └─ tool_call  list_files     0ms  in={"dir":"data"}  ok string(52)
├─ model_call turn-2         0ms  in=946 out=218  stop=tool_use
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-east.csv"}  ok string(98)
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-south.csv"}  ok string(99)
│  └─ tool_call  read_file      0ms  in={"path":"data/2026-q1-north.csv"}  ok string(101)
├─ model_call turn-3         0ms  in=1584 out=342  stop=tool_use
│  └─ tool_call  write_file     0ms  in={"path":"summary.md","content":"# …  ok string(27)
└─ model_call turn-4         0ms  in=1961 out=74  stop=end_turn

=== メトリクスサマリー（v-good）===
rounds=4 model_calls=4 tool_calls=5 errors=0 tokens_in=5303 tokens_out=730 tokens_total=6033 wall=1ms
ログ: runs/v-good/run.log.jsonl　成果物: runs/v-good/summary.md
```

あなたが実行して出てくる `trace_id`、`span_id`、`ts`、各所のミリ秒は私のものとは違います。id は実行ごとにランダム生成され、ミリ秒は実際の所要時間だからです。それ以外は、どの行も一字一句同じになるはずです。

このツリーを上から読み下すと、1つの完結した文になります。まずディレクトリを列挙し（`turn-1`）、次に**1ラウンドの中で3つのファイルを並列に読み**（`turn-2` の下の3つの兄弟ノード）、それからファイルを書き（`turn-3`）、最後に締めくくる（`turn-4`、`stop=end_turn`）。並列のあの3行は同じモデルレスポンスの中の3つの `tool_use` ブロックなので、`parent_id` が同じ `model_call` を指しています。ツリーの形が「モデルはこのラウンドで何をしたかったのか」をそのまま描き出しています。

`model_call` の列の `0ms` は真に受けないでください。スタブクライアントにはネットワークの往復がないので、モデルリクエストの所要時間はすべて0です。実 API に繋いだ後、この列は診断上の価値を持ちます。API リクエストの所要時間とツールの実行時間を追跡するのは、まさに性能のボトルネックを探すためです[^S4]。

ログファイルはこうなっています。1行に完全な JSON が1つで、そのまま `grep` できます。

```text
$ head -3 runs/v-good/run.log.jsonl
{"ts":"2026-08-30T03:54:21.577Z","trace_id":"tr-7f2cc208","span_id":"span-ecd7a44b","parent_id":"span-8dc25c01","kind":"model_call","name":"turn-1","duration_ms":0,"stop_reason":"tool_use","tokens":{"input":812,"output":96},"error":null}
{"ts":"2026-08-30T03:54:21.578Z","trace_id":"tr-7f2cc208","span_id":"span-b746a61d","parent_id":"span-ecd7a44b","kind":"tool_call","name":"list_files","tool_input":{"shape":"object{dir}","chars":14,"head":"{\"dir\":\"data\"}"},"duration_ms":0,"tool_result":{"shape":"string(52)","chars":52,"head":"2026-q1-east.csv 2026-q1-north.csv 2026-q1-south.csv"},"error":null}
{"ts":"2026-08-30T03:54:21.578Z","trace_id":"tr-7f2cc208","span_id":"span-f3b91fcf","parent_id":"span-8dc25c01","kind":"model_call","name":"turn-2","duration_ms":0,"stop_reason":"tool_use","tokens":{"input":946,"output":218},"error":null}
```

2行目があの `list_files` です。`parent_id` が1行目の `span_id` を指している（だから `turn-1` の下にぶら下がります）、`tool_input` の中には形状と長さと小さな抜粋しかなく、`tool_result` も同様です。`shape` は `string(52)` で、`head` には3つのファイル名が入っています。この行には「ファイルの中身」は1バイトもありませんが、「このステップは何を呼び、どんな形のものを受け取り、エラーになったか」にはもう答えられます。

メトリクスサマリーの行をもう一度見てください。4ラウンド、ツール呼び出し5回、エラー0、6033トークン、行末には総所要時間もあります。この数字の1行は、実行が終わるたびに一目走らせる価値があります。ツール呼び出しの回数はエージェントが繰り返し歩く決まった段取りを露わにしますし、冗長な呼び出しの山はページネーションやトークン上限のパラメータを調整すべきだと示唆することが多いです。一方、無効なパラメータのエラーの山は、ツールの説明をもっと明確に書き、例をもっと十分に与えるべきだと語っているかもしれません[^S3]。とりわけトークンは注視する価値があります。公式が評価結果を分析したところ、トークン使用量そのものだけで分散の80%を説明でき、残り2つの説明変数はツール呼び出し回数とモデルの選択でした[^S1]。

```agentmentor-check
{
  "id": "obs-zh-06-log-everything",
  "label": "ツールの入出力をどこまで記録すべきか",
  "prompt": "この観測レイヤーをプロジェクトに組み込んだところです。同僚がログを見て、tool_input と tool_result が先頭60文字の抜粋しかないのはケチすぎる、ツール呼び出しごとに入出力の全文を記録するように変えたらどうか、と言ってきました。「どうせディスクは安いんだから、全部記録して困ることはない。本当に何か起きたときに全部そこにある」。あなたはどう応じますか。",
  "whyHere": "読者は実際の run.log.jsonl を見終えたばかりで、その head フィールドは確かに切り詰められています。ここはこのレッスンの観測レイヤーで唯一、自分で線を引く必要のある設計判断であり、「全部記録して困ることはない」という直感にもっとも引きずられやすい場所でもあります。デフォルトの姿勢と全文を有効にする前提条件を理解しているか、ここで確認するのがちょうどよいでしょう。",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "同意します。ディスクは確かに安いですし、全文を残すのがいちばん確実です。何か起きたときに走らせ直さずに現場を再現できます。",
      "correct": false,
      "feedback": "「全部記録して困ることはない」が成り立つのはディスクの次元だけです。ログに座っているのはエージェントが読み書きした業務上の内容、つまりユーザーの入力、ファイルの中身、書き出したドキュメントです。これらが「運用ログ」としてしか承認されていない場所に落ちた時点で、機微データの管理外のコピーになります。しかもファイルはすぐに膨れます。1回の実行で数十件、各件に数 KB の全文を詰め込めば、数千回走った後は grep 1回にも時間がかかり、かえって探しにくくなります。本当に全文が必要なときの正しいやり方は、セッションのトランスクリプト自体を読むことであって、テレメトリのログにコピーを溜め込むことではありません。"
    },
    {
      "id": "b",
      "text": "デフォルトは構造と抜粋のままにします。形状、長さ、先頭数十文字があれば「どのステップの、どのパラメータで、戻り値は空か」の特定には十分です。全文を記録するなら、まずログの着地先がその種のデータを保存してよいと承認されているかを確認し、抜き取り確認で全文が要るときはセッションのトランスクリプトを読みに行きます。",
      "correct": true,
      "feedback": "正しい。公式のテレメトリのデフォルトの姿勢がまさにこれです。所要時間、モデル名、ツール名といった構造的なものはすべてのスパンに記録され、トークン数は API が使用量を返したときに記録される一方、エージェントが読み書きした内容はデフォルトでは収集されません。ユーザープロンプトも同じで、デフォルトでは長さだけを記録し、内容を記録するには別途スイッチを入れる必要があります。そしてこの種のスイッチに対する公式の一文は「あなたの観測パイプラインが、エージェントの扱うデータを保存してよいと承認されていない限り、これらは未設定のままにしておきなさい」です。これは性能上の提案ではなく、コンプライアンス上の制約です。特定のために本当に頼るのは構造のほうです。どのステップで、どんなパラメータで、どんな形の戻り値で、エラーになったか。全文が要るのは抜き取り確認のときだけで、それはトランスクリプトを読みに行けば済みます。"
    },
    {
      "id": "c",
      "text": "逆に振って、内容は1文字も記録しません。各ツールが何回呼ばれたかを数えるだけで十分で、あとは走らせ直して再現すればよいでしょう。",
      "correct": false,
      "feedback": "振りすぎですし、「走らせ直して再現する」はエージェントでは通らない道です。同じプロンプトでも2回の実行は別の、しかし同じくらい妥当な経路を通りますし、10回走らせて10回とも正しい結果が出るかもしれません。呼び出し回数の統計しかなければ、「エラーになったあの read_file はどんな経路を通ったのか」にすら答えられず、このレッスンの特定のプロセスは最初のステップで折れます。本当の分かれ目は「記録するかしないか」ではなく「構造を記録するか内容を記録するか」です。形状、長さ、パラメータ名、エラーメッセージは構造に属し、特定に使えます。ファイルの中身やユーザーの原文は内容に属し、デフォルトではディスクに書きません。"
    }
  ]
}
```

## 症状を再現する: v-bug

次はバグ入りを走らせます。スタブキューにはレッスン冒頭の本当の分岐点が埋め込んであります。先に覗かず、自分で出力から見つけてみてください。

```text
$ node observed-agent.mjs --version v-bug

=== トレースツリー（v-bug、run.log.jsonl から再構築）===
agent_run  sales-summary  2ms  trace_id=tr-b4fae843
├─ model_call turn-1         0ms  in=812 out=96  stop=tool_use
│  └─ tool_call  list_files     0ms  in={"dir":"data"}  ok string(52)
├─ model_call turn-2         0ms  in=946 out=218  stop=tool_use
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-east.csv"}  ok string(98)
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-sourth.csv"}  ERROR ENOENT: no such file or directory, open 'dat…
│  └─ tool_call  read_file      0ms  in={"path":"data/2026-q1-north.csv"}  ok string(101)
├─ model_call turn-3         0ms  in=1602 out=355  stop=tool_use
│  └─ tool_call  write_file     1ms  in={"path":"summary.md","content":"# …  ok string(27)
└─ model_call turn-4         0ms  in=1990 out=81  stop=end_turn

=== メトリクスサマリー（v-bug）===
rounds=4 model_calls=4 tool_calls=5 errors=1 tokens_in=5350 tokens_out=750 tokens_total=6100 wall=2ms
ログ: runs/v-bug/run.log.jsonl　成果物: runs/v-bug/summary.md
```

成果物は確かに間違っています。

```text
$ cat runs/v-bug/summary.md
# 2026年Q1 地域別売上サマリー

| 地域 | 合計 (¥) |
| --- | --- |
| East China | 548550 |
| Central China | 208000 |
| North China | 432600 |
| 総計 | 1189150 |

データソース: data/ ディレクトリの CSV ファイル
```

まず、外からは見えないことをいくつか押さえておきます。

- ラウンド数もツール呼び出し回数も `v-good` と同一です。4ラウンド、5回。この2つの数字だけを見ていると、2つの実行は同じに見えます。
- トークンは67しか増えていません（6100 対 6033）。アラートが「トークンがしきい値を超えたら」なら、これは鳴りもしません。
- 変わったのは `errors=1`、この1つの数字だけです。だからこそツールのエラーはメトリクスの一級市民でなければなりません[^S3]。サマリーの層で、この実行がおかしいと分かる唯一のシグナルなのです。
- 最後の `model_call` は `stop=end_turn` で、エージェントは**タスクを無事に完了した**と思っています。エラーも出さず、助けも求めず、データが1つ欠けていることにも触れません。エージェントがフィードバックで省いたことは、書いたことよりも重要でありうるのです[^S3]。

## 5ステップの特定: 症状の追跡から最初の分岐点まで

レッスン5の5ステップは汎用の編成でした。今回の材料は特殊で、行単位で比較できるログが3本手元にあるので、5つのうち3つは形を変えます。並べて書き出しておきます。

| レッスン5の汎用ステップ | 今回の形 | なぜ変わるか |
| --- | --- | --- |
| 1 絞り込む | この1回の実行に固定する | 同じ。id でフィルタする |
| 2 最初の分岐点を見つける | ツリーの中で見分ける | 同じ。証拠がツリーになっただけ |
| 3 再生して観察する | 下流を伝播として認識する | スタブ自体が固定された再生なので、このステップの枠は伝播の分析に譲る |
| 4 同じコンポーネントを繰り返し痛めつける | 原因を確定する | 3本のログを行単位で比較できるので、確率的な不具合を痛めつけて追い出す必要がない |
| 5 修正後は失敗地点から復帰する | 再実行して比較する | 下記参照。両者は矛盾せず、適用条件が違うだけ |

第5ステップは別途説明が必要です。レッスン5は「修正後は失敗地点から復帰し、最初からやり直さない」ことを勧めていました。理由は、丸ごとの再実行が非決定性を持ち込み直し、「正しく直した」と「今回は運がよかった」を区別できなくなるからです。このレッスンが丸ごとの再実行に踏み切れるのは、まさにモデル側がスタブで固定されているからです。再実行が新しい変数を持ち込まないので、行単位の比較が成立します。実 API に繋げばスタブはなくなるので、レッスン5のやり方、すなわち失敗地点からの復帰に戻ります。

今回の材料に着地させると、以下の5ステップになります。まだ答えを知らないつもりで、一度歩いてみてください。

### 第1ステップ: この1回の実行に固定する

本番環境では、すべての実行のログが1つのストリームに混ざります。まずこの状況を再現するため、3回分のログを結合します。

```text
$ cat runs/v-good/run.log.jsonl runs/v-bug/run.log.jsonl runs/v-fixed/run.log.jsonl > all-runs.log.jsonl
$ wc -l < all-runs.log.jsonl
      32
$ grep -c 'tr-b4fae843' all-runs.log.jsonl
10
```

32行のうち、バグの実行に属するのは10行だけです。このステップは公式が示したトレースのやり方を使っています。1つのプロンプトが引き起こしたすべてのアクティビティを追跡するには、その特定の id でイベントをフィルタします[^S4]。それが `prompt.id` と呼ばれようが `trace_id` と呼ばれようが関係ありません。大事なのは、この id が存在し、すべての記録がそれを持っていることです。

ついでにストリーム全体にエラーがいくつあるかも確認できます。

```text
$ grep -c '"error":{"shape"' all-runs.log.jsonl
2
```

2件です。`v-bug` に1件、`v-fixed` に1件。`v-good` はまっさらです。

### 第2ステップ: ツリーの中で最初の分岐点を見分ける

ツリーはすでに表示されています。上から下へ走査して、**期待に合わない最初の記録**を見つけます。

```text
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-sourth.csv"}  ERROR ENOENT: no such file or directory, open 'dat…
```

`turn-2` の下の3つの並列読み込みのうち、真ん中が壊れました。壊れた理由は `tool_input` に書いてあります。パスが `data/2026-q1-sourth.csv` で、`south` が `sourth` と打ち間違えられています。ツリーの `list_files` の行は `ok string(52)` としか出していないので、正しいファイル名を知るにはログを掘り返す必要があります。その記録を引き出すと（上の `head -3` ですでに見ています）、`tool_result.head` には `2026-q1-east.csv 2026-q1-north.csv 2026-q1-south.csv` とあります。モデルは正しい名前を確かに受け取っていました。ツリーが特定を担い、ログが詳細を担う。2つの層はまさにこう協力します。

その完全な記録を見るには、ストリームから釣り上げます。

```text
$ node -e '
const fs = require("node:fs");
const TRACE = "tr-b4fae843";
for (const line of fs.readFileSync("all-runs.log.jsonl", "utf8").split("\n").filter(Boolean)) {
  const r = JSON.parse(line);
  if (r.trace_id === TRACE && r.error) console.log(r.kind, r.name, r.tool_input.head, "->", r.error.head);
}'
tool_call read_file {"path":"data/2026-q1-sourth.csv"} -> ENOENT: no such file or directory, open 'data/2026-q1-sourth…
```

これが分岐点です。**どうやって見分けたか**に注意してください。推測ではなく、3つのフィールドによってです。`trace_id` が範囲をこの1回の実行に固定し、`error` が非 null であることが10件の記録から1件を選び出し、`tool_input.head` がパラメータのどこが間違っているかを教えます。3つのフィールドのどれ1つも欠かせません。

### 第3ステップ: 下流の不条理を伝播として認識し、個別に直さない

分岐点の後、`turn-3` ではモデルが Central China 地域を含む集計を書き、`turn-4` では「タスク完了」と報告します。どちらのステップもかなり不条理に見えますが、どちらも下流です。

| 記録 | 挙動 | 原因か伝播か |
| --- | --- | --- |
| `turn-2` の `read_file` のエラー | パラメータの打ち間違い、ツールは ENOENT を1行返す | **原因** |
| `turn-3` の `write_file` | 存在しない Central China 地域を書き込んだ | 伝播 |
| `turn-4` の `end_turn` | 無事に完了したと主張する | 伝播 |

エージェントのシステムでは、1つのステップの失敗だけでまったく別の軌道へ逸れ、最終結果は予測不能になります[^S1]。これはそのもっともきれいな例です。もし最終的な `summary.md` しか手元になかったら、どこを直しに行くでしょうか。おそらくプロンプトを変えに行くはずです。「データをでっち上げるな」「データソースを必ず明記せよ」。これらの変更はすべて伝播に当たっていて、病巣には当たっていません。次に打ち間違いの仕方が変われば、やはりでっち上げます。

ついでに、この症状がなぜ「South China が欠ける」ではなく「Central China」に育ったのかを説明します。モデルはファイル名を確かに受け取っていました（`2026-q1-south.csv` は `list_files` の戻り値にちゃんとあります）。east は East China、north は North China という対応も、最初に成功した2件の読み取り内容にすでに入っています。足りないのはその3か月分の具体的な数字だけでした。ところが、あの不透明な ENOENT のエラーは「正しいファイル名でリトライせよ」とも「止まってはっきり説明せよ」とも告げなかったので、モデルはいちばん楽な道を選びました。欠落を完全なものに見せかけ、地域名も数字も埋めたのです。でっち上げは何も知らないから起きたのではなく、エラーがそれよりましな出口を与えなかったから起きました。

### 第4ステップ: 原因を確定する——受け取ったフィードバックがひどかった

このステップでモデルを責めに走らないでください。あのエラーが実際にモデルへ何を与えたのかを見ます。

```text
ENOENT: no such file or directory, open 'data/2026-q1-sourth.csv'
```

この1行は人間のエンジニアには十分な情報ですが、「次に何をするか」を決めるエージェントにとってはほぼ空です。「このディレクトリのどのファイルなら読めるのか」も読み取れませんし、「自分が打ち間違えたのか、それともこのデータが本当に存在しないのか」も読み取れませんし、ましてや「この状況に出会ったら止まって尋ねるべきで、自分で埋めてはいけない」など読み取れません。エージェントは進捗を判断するために各ステップで環境からのグラウンドトゥルースのフィードバックに頼る必要があります[^S2]。この ENOENT が、モデルの得たフィードバックのすべてでした。

ツールエンジニアリングに関する公式の提案は、まさにこの隙間のためにあります。ツール呼び出しがエラーを起こしたとき、不透明なエラーコードやスタックトレースを投げるのではなく、エラーレスポンス自体をきちんと書き、具体的で実行可能な改善点を明確に説明すべきです[^S3]。ですから今回変えるべきなのはプロンプトではなく、`read_file` のエラーメッセージです。

### 第5ステップ: 再実行して比較する（スタブがモデル側を固定しているので、ここでは丸ごと再実行できる）

修正方法は次の節にあります。実行した後、数字が変わったかを見に戻ってきてください。特定は「原因が分かった」で終わるのではなく、「修正後、同じトレースのそのステップが本当に変わった」で終わります。

## 修正して再実行: v-fixed

変えたのはコードの `read_file` の部分、エラーメッセージだけです。

```javascript
if (ctx.errorStyle === "actionable") {
  const available = fs
    .readdirSync(path.join(ctx.root, "data"))
    .sort()
    .map((f) => `data/${f}`)
    .join(", ");
  throw new Error(
    `ファイル ${p} が見つかりません。現在 data/ にあるのは: ${available}。` +
      `list_files が返した元のファイル名でリトライしてください。必要なデータが本当に存在しないなら、` +
      `処理を止めて、どのファイルが足りないかをユーザーに伝えてください。欠けている数字を自分で見積もらないでください。`
  );
}
```

このメッセージには3つのものが詰め込まれています。**現在の状態**（ディレクトリに実際に何があるか）、**次に何をすべきか**（元のファイル名でリトライする）、**いつ止まるべきか**（データが本当にないなら人に聞き、見積もらない）。前の2つはモデルに歩ける道を与え、3つ目はでっち上げの道をふさぎます。

`v-fixed` のレスポンスキューは、このエラーを受け取った後のモデルの反応を示しています。下へ向かってでっち上げるのをやめ、環境に確認を取りに戻ります。エラーメッセージに列挙された元のファイル名で1回読み直し、最後の締めくくりの文でもユーザーに聞き返します。「data/ の外に他の地域のデータがあるなら、どこにファイルがあるか教えてください。数字を自分で埋めることはしません」。

```text
$ node observed-agent.mjs --version v-fixed

=== トレースツリー（v-fixed、run.log.jsonl から再構築）===
agent_run  sales-summary  2ms  trace_id=tr-ae0dedca
├─ model_call turn-1         0ms  in=812 out=96  stop=tool_use
│  └─ tool_call  list_files     0ms  in={"dir":"data"}  ok string(52)
├─ model_call turn-2         0ms  in=946 out=218  stop=tool_use
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-east.csv"}  ok string(98)
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-sourth.csv"}  ERROR ファイル data/2026-q1-sourth.csv が見つかりません。現在 dat…
│  └─ tool_call  read_file      0ms  in={"path":"data/2026-q1-north.csv"}  ok string(101)
├─ model_call turn-3         0ms  in=1688 out=64  stop=tool_use
│  └─ tool_call  read_file      0ms  in={"path":"data/2026-q1-south.csv"}  ok string(99)
├─ model_call turn-4         0ms  in=1849 out=342  stop=tool_use
│  └─ tool_call  write_file     0ms  in={"path":"summary.md","content":"# …  ok string(27)
└─ model_call turn-5         0ms  in=2226 out=118  stop=end_turn

=== メトリクスサマリー（v-fixed）===
rounds=5 model_calls=5 tool_calls=6 errors=1 tokens_in=7521 tokens_out=838 tokens_total=8359 wall=2ms
ログ: runs/v-fixed/run.log.jsonl　成果物: runs/v-fixed/summary.md
```

ツリーの形が変わりました。`turn-2` のあの ERROR は元の位置に残っていますが、その下に `turn-3` が生え、中には正しいファイル名での読み直しが1回入っています。成果物も正しくなりました。

```text
$ diff runs/v-good/summary.md runs/v-fixed/summary.md
$ echo $?
0
```

2つの `summary.md` はバイト単位で同一で、Central China 地域は消えました。

3回の実行を並べます。

| | `v-good` | `v-bug` | `v-fixed` |
| --- | --- | --- | --- |
| rounds | 4 | 4 | 5 |
| tool_calls | 5 | 5 | 6 |
| errors | 0 | 1 | 1 |
| tokens_total | 6033 | 6100 | 8359 |
| `summary.md` | 正しい | Central China 地域がある | 正しい |

はっきり述べておくべきことが2つあります。そうでないとこの修正は誤解されやすいのです。

**1つ目、`errors` はゼロに戻っていませんし、戻るべきでもありません。** 打ち間違えた読み取りは依然としてエラーになっていて、私たちが変えたのはエラーメッセージだけ、モデルがエラーから這い上がれるようにしただけです。`errors` を本当にゼロに戻す修正は別の方向にあります。ツールの説明をもっと明示的に書き、例を与えて、モデルがそもそも打ち間違えないようにすることです。公式の診断的な読み方はまさにこう対応します。無効なパラメータのエラーが大量にあるなら、ツールの説明をもっと明確に、例をもっと十分にすべきだ、というものです[^S3]。このスクリプトの `read_file` の説明にはすでに「パスは list_files が返した元のファイル名を使うこと」と書いてありますが、明らかにまだ足りません。次のラウンドでは正例を与えるべきです。

**2つ目、修正はタダではありません。** トークンは6033から8359へ、2326増え、38%の増加です。増えた分はあの読み直しの1往復から来ています。爆発というほどではありませんが、コストゼロでもありません。修正のコストはテーブルに載せて計算しなければならず、「結果が正しい」だけを見て終わりにはできません。

## この観測レイヤーの境界はどこにあるか

これは小さなものなので、境界をはっきり述べておきます。これを組み込めば本番の可観測性が手に入る、と思わないためです。

**1プロセス、1回の実行を対象とします。** ログは `appendFileSync` でローカルファイルに直接書くので、プロセスが kill されても失われません。これは意図的な選択です。実バックエンドに繋げば、この扱いにはなりません。OTLP の道では、エクスポートの失敗はデフォルトで静かで、エンドポイントに到達できないか拒否された場合でも、エージェントは動き続け、テレメトリはそのまま捨てられ、アプリケーションにはエラーすら出ません。さらにテレメトリはバッチにまとめられて一定間隔でエクスポートされるので、エクスポートの前にプロセスが kill されれば、バッチバッファにあるものは消えます[^S6]。レッスン4の「観測パイプラインは静かにあなたに嘘をつく」がこの区間の話です。ローカルファイルはこの落とし穴を回避しますが、代償としてローカルマシンの上にしか存在しません。

**実バックエンドへの接続とマルチプロセスの集約はこのレッスンの範囲外です。** このレイヤーを Honeycomb、Datadog、Grafana、Langfuse、あるいはセルフホストのコレクターに繋ぐには OTLP のプロトコル一式が必要で[^S6]、フィールドのマッピングし直しも要ります。それは別の話題です。複数のエージェントプロセスのログをどう集約するか、サービス名でどう区別するかも同様です。

**アラートのしきい値について、このレッスンは数字を出しません。** 「ツールのエラー率がいくつを超えたらアラートすべきか」「1回の実行がトークンをいくつ超えたら異常か」——公式ドキュメントはアラートがあなたのバックエンドの仕事だと述べただけで、数字はまったく示していません[^S4]。私もでっち上げません。あなたのしきい値は、あなた自身のベースラインからしか育ちません。まずしばらく走らせ、正常な実行の分布がどうなるかを見てから、線を引いてください。

**内容の記録はデフォルトでオフです。** 上の `HEAD_CHARS = 60` はごく短い抜粋しか残していません。本当に全文を有効にするには、あなたの観測パイプラインが、エージェントの扱うデータを保存してよいと承認されていることが前提です[^S6]。先にデータの承認を通し、それからコードを変える。逆ではありません。

**サンプリングレートとログの保持期間も広げません。** 1回の実行で JSONL は数十行、ローカルで数百回走らせるくらいなら管理は不要です。これらを検討する必要が出てきた時点で、それはもうバックエンドの問題です。

最後に一言。この観測レイヤーの価値は、どれだけ多く記録したかにあるのではなく、**具体的な問いを立てられるようにすること**にあります。「なぜ Central China 地域をでっち上げたのか」は答えのない問いです。「`trace_id=tr-b4fae843` のこの実行で、`error` が非 null になっている最初の記録はどれで、そのパラメータは何か」は答えのある問いです。本番のトレーシングを完全に組み込んで初めて、エージェントがなぜ失敗したのかを体系的に診断し、体系的に修正できるようになります[^S1]。

## 💻 演習

<!-- exercises -->

### レベル1: 解説なしで、自分でこのツリーを読む

以下のトレースツリーは `v-bug` を実際に走らせて得たものです（本文のものと同じで、`trace_id` とミリ秒は実行ごとに変わります）。初めて見るつもりになってください。同僚からは「summary.md にうちの会社にない Central China 地域がある」という1行が投げられただけです。

```text
agent_run  sales-summary  2ms  trace_id=tr-b4fae843
├─ model_call turn-1         0ms  in=812 out=96  stop=tool_use
│  └─ tool_call  list_files     0ms  in={"dir":"data"}  ok string(52)
├─ model_call turn-2         0ms  in=946 out=218  stop=tool_use
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-east.csv"}  ok string(98)
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-sourth.csv"}  ERROR ENOENT: no such file or directory, open 'dat…
│  └─ tool_call  read_file      0ms  in={"path":"data/2026-q1-north.csv"}  ok string(101)
├─ model_call turn-3         0ms  in=1602 out=355  stop=tool_use
│  └─ tool_call  write_file     1ms  in={"path":"summary.md","content":"# …  ok string(27)
└─ model_call turn-4         0ms  in=1990 out=81  stop=end_turn
```

同僚はあの `list_files` のログ記録も引っ張り出してくれました。ツリーの上では `ok string(52)` としか出ていませんが、詳細はログにあります（id とミリ秒は例によって実行ごとに変わります）。

```json
{"trace_id":"tr-b4fae843","span_id":"span-603fe632","parent_id":"span-bd6b7c23","kind":"tool_call","name":"list_files","tool_input":{"shape":"object{dir}","chars":14,"head":"{\"dir\":\"data\"}"},"duration_ms":0,"tool_result":{"shape":"string(52)","chars":52,"head":"2026-q1-east.csv 2026-q1-north.csv 2026-q1-south.csv"},"error":null}
```

コードは書かず、4つの問いに文章で答えてください。

1. 最初の分岐点は**どの行**ですか。
2. それを分岐点だと判断する**根拠**は、ツリー上とこのログ記録の中のどのフィールドですか。フィールド名と、それぞれが何の可能性を排除するのかを挙げてください。
3. 分岐点の後のどの行が、独立した不具合ではなく**伝播**ですか。1行ずつ述べてください。
4. もし最後の `summary.md` しか手元になく、このツリーがなかったら、おそらく**誰を誤って責める**でしょうか。なぜその方向ではこのバグを直せないのですか。

<!-- rubric -->

- 問1で `turn-2` の下の ERROR がついた `read_file` を指し、パラメータが `data/2026-q1-sourth.csv`（打ち間違えたほう）だと述べている
- 問2で少なくとも3つのフィールドと、それぞれの役割を挙げている: `error`（非 null で、他の記録から1件を選び出す）、`tool_input`（パラメータの打ち間違いを露わにし、「ファイルが本当に存在しない」を排除する）、あの `list_files` のログ記録の `tool_result.head`（モデルが正しいファイル名を確かに受け取っていたことを証明し、「どのファイルがあるか知らない」を排除する）
- 問3で `turn-3` の `write_file` と `turn-4` の `end_turn` の両方を伝播と判断し、その不条理がすべて上流の失敗した読み取りに由来すると説明している
- 問4でモデルの「ハルシネーション」かプロンプトを誤って責めるだろうと指摘し、プロンプトに「でっち上げるな」を足しても直らない理由を説明している——病巣はツールのフィードバックが粗末なことであって、指示が厳しくないことではない

<!-- answer -->

1. 最初の分岐点は `turn-2` の下の**3つの並列 `read_file` の真ん中**です。`in={"path":"data/2026-q1-sourth.csv"}` で、結果は ERROR。上の2行と下の1行はすべて `ok` で、これだけが壊れています。

2. 3つのフィールドが揃って見分けさせてくれます。

   - `error` フィールドが非 null——これはツリー全体で唯一 ERROR を持つ記録で、他の9件はすべて正常です。候補の範囲を10件から1件に圧縮します。
   - `tool_input` の抜粋——パスが `south` ではなく `sourth` です。これは「そのデータが本当に存在しない」を排除します。おかしいのはパラメータであって、データではありません。
   - あの `list_files` のログ記録の `tool_result.head` に `2026-q1-south.csv` がある——モデルは明らかに正しいファイル名を受け取っていました。これは「ディレクトリに何があるか知らない」を排除します。

   3つのフィールドのどれ1つが欠けても結論は立ちません。`error` だけなら何かが起きたことは分かっても、どこで間違えたかは分かりません。`tool_input` だけなら、その呼び出しが成功したか失敗したかが分かりません。あの `list_files` の戻り値がなければ、モデルに正しい名前を知る機会があったのかを判断できません。

3. 分岐点の後の2行はどちらも伝播です。

   - `turn-3` の `write_file`: 書き込んだ Central China 地域はでっち上げですが、モデルがでっち上げたとき、実際にデータが1つ欠けていて、受け取ったエラーは何が欠けているかを教えてくれませんでした。このステップは、前のステップの残骸の上でなされた判断です。
   - `turn-4` の `end_turn`: タスク完了と報告し、データが1つ欠けていることにまったく触れていません。これも同じく残骸の続きです。やるべきことはやったと思っているのです。

   1つのステップの失敗だけでエージェントはまったく別の軌道へ逸れます。この2行はその軌道上の2点であって、2つの独立したバグではありません。どちらかを個別に直しても、失敗の仕方が変わればまた新しいものが生えてきます。

4. `summary.md` だけを見ていると、いちばん責めやすいのは**モデル**です。ハルシネーションを起こした、データをでっち上げた、だからプロンプトに「データをでっち上げるな」「各数字の出所を必ず明記せよ」を足そう、となります。この方向では直りません。理由は2層あります。

   - 病巣は指示ではなくフィードバックにあります。あのステップでモデルが受け取った情報のすべては `ENOENT: no such file or directory` の1行で、その中には「ディレクトリにどのファイルがあるか」も「リトライすべきか止まって人に聞くべきか」もありません。プロンプトでいくら大声を出しても、そのステップでモデルの手にある材料はやはりあの1行です。
   - プロンプトはグローバルで、分岐はローカルです。「でっち上げるな」を1行足すと毎ラウンドの挙動に影響しますが、本当に挙動を変えるべき点は「ツールのエラーの次の一歩」というこの1点だけです。エラーメッセージを変えれば点に当たり、プロンプトを変えれば表面にふりかけるだけです。

   補足: そもそも `trace_id` すらなく、ログが1つのストリームに混ざっていたら、「どの10行がこの実行のものか」を囲むことすらできず、この4つの問いはどれ1つ着手できません。

<!-- hint -->

上から下へ走査してください。`summary.md` から逆算しないこと。期待に反する最初の記録はどの層に現れますか。「期待に反する」は、このツリー上では非常に分かりやすい視覚的な目印を持っています。

<!-- hint -->

問2が求めているのは「ERROR と書いてあるから」ではなく、**3つ**のフィールドがそれぞれ1つの可能性を排除することです。分けて問うてみてください。この呼び出しは成功したのか失敗したのか（どのフィールド）。おかしいのはパラメータかデータ自体か（どのフィールド）。そのときモデルは正しいファイル名を知っていたのか（どのフィールド——ツリー上か、あのログ記録の中か）。

### レベル2: 観測レイヤーに「実行間の比較」を足す

単発の実行のメトリクスだけを見ていても、変更がよかったのか悪かったのかは判断しにくいものです。`compare-runs.mjs` を書いて、2つの `run.log.jsonl` を読み、`kind` ごとに集計して並べて比較してください。要件は次のとおりです。

- コマンドラインでログファイルのパスを2つ受け取ります: `node compare-runs.mjs <A> <B>`。パラメータが足りなければ使い方を表示し、終了コード2で終わります。
- 少なくとも次を比較します: モデル呼び出し回数、ツール呼び出し回数、エラー数、`tokens_in` / `tokens_out` / `tokens_total`、総所要時間。トークンの行には変化率も出します。
- 次にツール名でグループ化し、各ツールが何回呼ばれたかを比較します。
- **どちらかの側のエラー数が0より大きければ非ゼロで終了**し、どちら側が何回かを表示します。
- 書けたら `v-good` と `v-fixed` を比較して答えてください。修正は新しいエラーを持ち込みましたか。トークンはどれだけ増えましたか。

<!-- rubric -->

- スクリプトが依存ゼロで素の `node` で走り、パラメータが2つとも欠けているときは使い方を表示して `process.exit(2)` する
- 集計方法が `kind`（`model_call` / `tool_call` / `agent_run`）でフィルタしてから数える形になっており、行番号のハードコードではない
- トークンの3行に変化率があり、回数の行には増減の数字がある
- ツール名別の比較が、両側に現れるすべてのツール名を網羅している（片側にしかないときは0で埋める）
- エラーの関所が本当に機能する: 両側とも0なら終了コード0、どちらかが0より大きければ非ゼロで、かつ各側のエラー数を表示する
- 結論の部分で、`v-fixed` のエラー数がまだ1であること（あの打ち間違えた読み取りは残っている）と、トークン増加の具体的な数字を明記している

<!-- answer -->

以下が完全な実装です。`observed-agent.mjs` と同じディレクトリに置いてください。

```javascript
#!/usr/bin/env node
// compare-runs.mjs —— 2回の実行の run.log.jsonl を比較する
// 使い方: node compare-runs.mjs <A の run.log.jsonl> <B の run.log.jsonl>
// どちらかの側にツールのエラーがあれば非ゼロで終了する。
import fs from "node:fs";

function load(file) {
  const records = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const model = records.filter((r) => r.kind === "model_call");
  const tool = records.filter((r) => r.kind === "tool_call");
  const root = records.find((r) => r.kind === "agent_run");
  const byTool = new Map();
  for (const r of tool) byTool.set(r.name, (byTool.get(r.name) ?? 0) + 1);
  return {
    file,
    trace_id: records[0]?.trace_id ?? "(空のログ)",
    model_calls: model.length,
    tool_calls: tool.length,
    errors: records.filter((r) => r.error).length,
    tokens_in: model.reduce((s, r) => s + r.tokens.input, 0),
    tokens_out: model.reduce((s, r) => s + r.tokens.output, 0),
    wall_ms: root?.duration_ms ?? 0,
    byTool,
  };
}

const pad = (v, w) => String(v).padStart(w);

function deltaOf(a, b, asPercent) {
  const d = b - a;
  const sign = d > 0 ? "+" : d < 0 ? "" : "±";
  if (!asPercent || a === 0) return `${sign}${d === 0 ? 0 : d}`;
  return `${sign}${d}（${sign}${((d / a) * 100).toFixed(1)}%）`;
}

function main() {
  const [fileA, fileB] = process.argv.slice(2);
  if (!fileA || !fileB) {
    console.error("使い方: node compare-runs.mjs <A の run.log.jsonl> <B の run.log.jsonl>");
    process.exit(2);
  }
  const a = load(fileA);
  const b = load(fileB);

  console.log(`A: ${a.file}  trace_id=${a.trace_id}`);
  console.log(`B: ${b.file}  trace_id=${b.trace_id}`);
  console.log(`\n${"指標".padEnd(11)}${pad("A", 7)}${pad("B", 8)}   変化`);
  const rows = [
    ["model_calls", a.model_calls, b.model_calls, false],
    ["tool_calls", a.tool_calls, b.tool_calls, false],
    ["errors", a.errors, b.errors, false],
    ["tokens_in", a.tokens_in, b.tokens_in, true],
    ["tokens_out", a.tokens_out, b.tokens_out, true],
    ["tokens_total", a.tokens_in + a.tokens_out, b.tokens_in + b.tokens_out, true],
    ["wall_ms", a.wall_ms, b.wall_ms, false],
  ];
  for (const [name, va, vb, pct] of rows) {
    console.log(`${name.padEnd(13)}${pad(va, 7)}${pad(vb, 8)}   ${deltaOf(va, vb, pct)}`);
  }

  console.log("\nツール名別:");
  for (const name of [...new Set([...a.byTool.keys(), ...b.byTool.keys()])].sort()) {
    const va = a.byTool.get(name) ?? 0;
    const vb = b.byTool.get(name) ?? 0;
    console.log(`${name.padEnd(13)}${pad(va, 7)}${pad(vb, 8)}   ${deltaOf(va, vb, false)}`);
  }

  if (a.errors > 0 || b.errors > 0) {
    console.log(`\ngate 不合格: A 側のエラー ${a.errors} 件、B 側のエラー ${b.errors} 件。`);
    process.exit(1);
  }
  console.log("\ngate 通過: 両側ともエラー記録なし。");
  process.exit(0);
}

main();
```

**まず関所そのものを検証します。** これはレッスン4のあの規律の直接の適用です。新しく取り付けた検出器は、まず「通すべき」状況で本当に通すことを確認します。そうしないと、その後に読む終了コードはどれも信用できません。`v-good` を自分自身と比べます。

```text
$ node compare-runs.mjs runs/v-good/run.log.jsonl runs/v-good/run.log.jsonl
A: runs/v-good/run.log.jsonl  trace_id=tr-7f2cc208
B: runs/v-good/run.log.jsonl  trace_id=tr-7f2cc208

指標               A       B   変化
model_calls        4       4   ±0
tool_calls         5       5   ±0
errors             0       0   ±0
tokens_in       5303    5303   ±0（±0.0%）
tokens_out       730     730   ±0（±0.0%）
tokens_total    6033    6033   ±0（±0.0%）
wall_ms            1       1   ±0

ツール名別:
list_files         1       1   ±0
read_file          3       3   ±0
write_file         1       1   ±0

gate 通過: 両側ともエラー記録なし。
$ echo $?
0
```

すべて `±0`、終了コードは0です。関所は通せます。使う準備ができました。

**次に `v-good` と `v-fixed` を比較します。**

```text
$ node compare-runs.mjs runs/v-good/run.log.jsonl runs/v-fixed/run.log.jsonl
A: runs/v-good/run.log.jsonl  trace_id=tr-7f2cc208
B: runs/v-fixed/run.log.jsonl  trace_id=tr-ae0dedca

指標               A       B   変化
model_calls        4       5   +1
tool_calls         5       6   +1
errors             0       1   +1
tokens_in       5303    7521   +2218（+41.8%）
tokens_out       730     838   +108（+14.8%）
tokens_total    6033    8359   +2326（+38.6%）
wall_ms            1       2   +1

ツール名別:
list_files         1       1   ±0
read_file          3       4   +1
write_file         1       1   ±0

gate 不合格: A 側のエラー 0 件、B 側のエラー 1 件。
$ echo $?
1
```

2つの問いに答えます。

- **新しいエラーを持ち込んだか。** 新しいものはありませんが、古いものは残っています。`v-fixed` の `errors=1` は、まさに `south` を `sourth` と打ち間違えたあの読み取りです。エラーメッセージを変えたのは「エラーの後にモデルが何をするか」であって、「モデルが打ち間違えるかどうか」ではありません。だから関所は不合格と判断し、終了コードは1になります。この結果は正しいものです。この関所が問うているのは「この実行にまだツールのエラーがあるか」であって、「最終的な成果物が正しいか」ではありません。成果物が正しいかは別途検証が必要です（`diff runs/v-good/summary.md runs/v-fixed/summary.md` は空です）。`errors` を本当にゼロに戻すには、次に動かすべきなのは `read_file` の説明で、正例を与えてモデルがそもそも打ち間違えないようにすることです。
- **トークンはどれだけ増えたか。** 合計は6033から8359へ、2326の増加、38.6%増です。増えた分はすべてあの読み直しの1往復にあります（`read_file` が3回から4回に、モデル呼び出しが4回から5回になりました）。38%は爆発ではありませんが、タダでもありません。修正のコストはこのテーブルの上で認めなければならず、結果が正しいのを見て終わりにはできません。

`wall_ms` の行のあの `+1` も真に受けないでください。スタブクライアントはネットワークリクエストを送らないので、2回の実行の実時間は基本的にファイル I/O のノイズで、実行ごとに変わります（同じコードを2回走らせても、この差分の符号は反転しえます）。実 API に繋いだ後、この行は意味を持ちます。

<!-- hint -->

`load()` に必要なのは `readFileSync` 1回と `split("\n")` だけで、あとの統計はすべて同じ配列に対する `filter` と `reduce` です。`byTool` は `Map` で加算するのがいちばん簡単です。両側のツール名の和集合を取るときは `new Set([...a.keys(), ...b.keys()])` を使うのを忘れないでください。そうしないと片側にしかないツールが漏れます。

<!-- hint -->

終了コードは明示的に `process.exit()` する必要があります。スクリプトが正常に終われば自動的に0になる、と期待しないでください。`console.log` の後のプロセスのデフォルト終了コードは確かに0ですが、関所が不合格の道では自分で `process.exit(1)` を書く必要があります。検証するときはシェルで `echo $?` を使って直前のコマンドの終了コードを見ます。

<!-- /exercises -->

## まとめ

- 観測3点セットはそれぞれ1区間を担います。JSON Lines のログが「記録すること」を、トレースツリーが「順序と帰属をはっきり見ること」を、メトリクスサマリーが「この実行が正常に見えるかを一目で見ること」を担います。ツリーもサマリーもディスク上の JSONL から再構築されるので、ログに記録されていないものはツリーには決して現れません
- すべての記録は `trace_id` と `parent_id` を持つ必要があります。前者は散らばった記録を同じ実行へ囲い戻し、後者はそれらをツリーに再構築させます。これは、1つのプロンプトが引き起こしたすべてのイベントを `prompt.id` で結びつけ、それでフィルタして特定するという公式の技法とまったく同じものです[^S4]
- 内容はデフォルトで全文を書きません。公式のテレメトリのデフォルトの姿勢は、構造的なものはすべて記録し、エージェントが読み書きした内容は収集せず、ユーザープロンプトは長さだけを記録するというものです。内容の記録を有効にする前提は、あなたの観測パイプラインがその種のデータを保存してよいと承認されていることです[^S6]
- あの5つのメトリクスの数字（所要時間、呼び出し回数、トークン、エラー数、総所要時間）は、第10コース（検証と品質保証: 「正しく見える」を通すな）で採点に使ったのと同じセットで[^S3]、ここでは診断用に持ち替えています。今回の比較では、`v-good` と `v-bug` のラウンド数、呼び出し回数、トークンはほぼ同一で、変わったのはエラー数だけでした
- 特定の要となる動作は、ツリーの中で**最初の**分岐点を見分け、それより下流の不条理はすべて一律に伝播として扱うことです。1つのステップの失敗だけでエージェントはまったく別の軌道へ逸れるので[^S1]、最後の成果物の層を直しに行くのは影を直すのと同じです
- ツールのエラーメッセージを直すのは、病巣に当たる修正です。エラーレスポンスは、不透明なエラーコードやスタックトレースを投げるのではなく、具体的で実行可能な改善点を明確に説明すべきです[^S3]。この修正の後、モデルは「Central China 地域をでっち上げる」から「元のファイル名で1回読み直し、他にデータがあるかユーザーに聞き返す」へと変わりました
- 修正後は必ず再実行して比較し、請求書も認めなければなりません。`errors` はゼロに戻っておらず（打ち間違いは残っています）、トークンは38%増えました（1往復増えたためです）。「結果が正しい」は「コストがゼロ」を意味しません

6つのレッスンの本筋はここで終わりです。レッスン1は、なぜ言えないのかをはっきりさせました。エージェントは2回の実行で別の道を通り、1つの症状の下には外からは見分けのつかない複数の原因が押し込まれています。レッスン2は、第一級の証拠を生のトランスクリプトに固定しました。自己申告ではありません。レッスン3は、各ステップをフィールドを持つデータに変えました。レッスン4は、散らばったデータを木につなぎ、ついでにこのパイプライン自体が静かに嘘をつくことを教えました。レッスン5は、ループの関所に探針を取り付け、特定の歩き方を与えました。このレッスンは前の5つのレッスンを、400行ほどの依存ゼロのファイルにはんだ付けし、それを使って「Central China 地域はどこから来たのか」を `turn-2` のパスを打ち間違えた読み取りまで本当に辿りました。

これはこのシリーズの第11コースでもあります。次にあなたのエージェントがどこで間違えたか言えなくなったとき、あなたの手にあるのは「モデルが作り話をした」という一言だけではありません。grep できるログ、ある行を指さして話せる木、コストを計算できるサマリーの表、そして症状の追跡から最初の分岐点までの一連の歩き方があります。残っているのは、`observed-agent.mjs` の3つの観測区間（ロガー、トレースツリー、メトリクスサマリー）をそっくり自分のハーネスへ移し、第7節のやり方に従ってその2枚のレイヤーをループの周りに巻くことです。フィクスチャとスタブはこのレッスンの教材用の足場なので、持っていかないでください。そのうえで最初の本物のタスクを走らせ、その最初の `run.log.jsonl` に、元は見当もつかなかった何が入っているかを見てください。






