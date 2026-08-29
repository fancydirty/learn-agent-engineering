# レッスン6: ハンズオン: エージェント用の評価トラックを構築する

> 学習目標:
> - 評価セット、階層化した採点、ハーネスのループをつなぎ合わせ、繰り返し実行できる `eval-runner.mjs` にする——評価タスク1件につき独立したループを1本
> - レポートに通過率だけでなく、タスクごとの所要時間、ツール呼び出し回数、トークン消費、ツールエラーも記録させ、それらの列で問題を診断する
> - このトラックでシステムプロンプトの変更が持つ本当の影響を測り、同じトラックで「正しい出力を落とす厳しすぎる検証器」を捕まえて直す
>
> 前提: レッスン1〜5を読み終え、本シリーズ7つめのコースのハーネスのループが手元で動かせること | 前: [レッスン5 <<](./05-eval-sets.md)

これまでの5つのレッスンはすべて部品でした。ステップごとの照合ではなく終状態を検証する（レッスン2）、決定的チェックを優先し、厳しすぎる検証器に気をつける（レッスン3）、自由記述テキストになって初めて LLM ジャッジの出番（レッスン4）、評価セットは現実のタスク20件ほどから始める（レッスン5）。単独ではどれも筋が通っていますが、プロンプトを変えたあと、コマンド1つで走らせて「良くなったのか悪くなったのか」を数字に語らせる何かが、まだ手元にありません。

このレッスンで部品を溶接します。出来上がるのは300行ほどのファイルで、1回の実行に2秒かかりません。「評価をどう回すか」に対する公式の指針は直截です。直接の LLM API 呼び出しを使い、プログラム的に回すこと。シンプルなエージェント的ループ——LLM 呼び出しとツール呼び出しを交互に行う while ループ——を使い、**評価タスク1件につきループを1本**回すこと[^S3]。これはまさに本シリーズ7つめのコースの、`stop_reason` で駆動されるあのループです。そのまま移植できます。

## 動かした様子を先に見る

このレッスンの後半にある `eval-runner.mjs` 全文をローカルに保存し、`node eval-runner.mjs`:

```text
=== レポート · プロンプト v1 · 検証器 normalized（修正後） ===
タスク            判定方式        結果      スコア  呼出  エラー    トークン    所要時間
----------------------------------------------------------------------------------------
t1-total          決定的          pass        1.00     3       0       1,800       127ms
t2-pending        決定的          pass        1.00     1       0         995        82ms
t3-no-orderid     決定的          FAIL        0.00     2       1       1,550       125ms
t4-refund-note    LLM ジャッジ    FAIL        0.67     1       0       1,432       129ms
t5-missing-order  決定的          pass        1.00     1       1         966        84ms
----------------------------------------------------------------------------------------
通過率 3/5 (60%) · ツール呼び出し 8 · ツールエラー 2 · トークン 6,743 · 合計 547ms

未通過の詳細:
  [t3-no-orderid] 判定基準: パラメータが不完全なときはツールを一度も呼ばず、注文番号を尋ね返すこと
  Agent の回答: 注文 SO-1001 のステータスは完了済みです。
  [t4-refund-note] 判定基準: 金額は注文と一致し、トーンも適切。ただし返金の入金時期が書かれておらず、顧客が見通しを持てない。3項目のうち1項目が欠落。
  Agent の回答: お世話になっております。ご注文 SO-1003（金額 ¥320.00）のキャンセルを承りました。返金は元のお支払い方法へお戻しいたします。ご不便をおかけし申し訳ございません。

=== レポート · プロンプト v2 · 検証器 normalized（修正後） ===
タスク            判定方式        結果      スコア  呼出  エラー    トークン    所要時間
----------------------------------------------------------------------------------------
t1-total          決定的          pass        1.00     3       0       1,800       126ms
t2-pending        決定的          pass        1.00     1       0         995        83ms
t3-no-orderid     決定的          pass        1.00     0       0         487        43ms
t4-refund-note    LLM ジャッジ    pass        1.00     1       0       1,518       124ms
t5-missing-order  決定的          pass        1.00     1       1         966        84ms
----------------------------------------------------------------------------------------
通過率 5/5 (100%) · ツール呼び出し 6 · ツールエラー 1 · トークン 5,766 · 合計 460ms

=== スコアの変化 v1 -> v2 ===
タスク                 v1     v2  変化
--------------------------------------------------
t1-total             1.00   1.00  横ばい
t2-pending           1.00   1.00  横ばい
t3-no-orderid        0.00   1.00  fail => pass
t4-refund-note       0.67   1.00  fail => pass
t5-missing-order     1.00   1.00  横ばい
--------------------------------------------------
通過率 3/5 -> 5/5
```

これは手で書いた例ではありません——一時ディレクトリでの実際の実行結果を、そのまま写したものです。全コードをコピーして1回走らせてみてください。「所要時間」の列（実際の壁時計時間で、マシンの負荷によって揺れます）以外は、ミリ秒単位まで一致します。数字が同じなのは、スタブ client が決め打ちの応答を返すからです。

この出力には、このレッスンで扱うことがすべて詰まっています。5件のタスクがそれぞれ自分のループを回し、2種類の採点方式が1つの表に混在し、通過率に加えて4列の診断指標があり、2つのバージョンの差分が1枚の比較表に落ちています。残りのページはこれを解きほぐしていきます。

## トラックの5つの部品

1. **被テストシステム**: ツール定義、ツールの実際の実装、そしてそれらの背後にあるデータ。評価が回すのは「エージェントがあなたのツールを使って仕事をする」ことなので、ツールも被テスト対象の一部です。
2. **スタブ client**: 決め打ちのキュー順に応答を返す偽の `messages.create`。これでトラック全体が再現可能になります。
3. **評価セット**: `tasks` 配列で、各要素は `{id, prompt, verify}`。公式の要求は、各評価プロンプトを検証可能な応答または結果と対にすることです[^S3]——検証器のないプロンプトは評価タスクではなく、ただのお試しです。
4. **採点**: 決定的に判定できるものは `verify` 関数へ、自由記述テキストになって初めてジャッジへ回します。
5. **ループとレポート**: タスク1件につき while ループ1本、終わったら指標を表に集計します。

先に1つ確定させておきます。**タスクは `messages` を共有しません。** 各タスクの `messages` はそのタスクのユーザープロンプトだけから始まり、自分のループを回し、そして捨てられます[^S3]。なぜこれがそれほど重要なのかは、中盤のクイズで直接問います。

## 部品1: ツールとその背後のデータ

被テストシステムは注文アシスタントで、注文が4件、ツールが2つあります。`search_orders`（顧客名またはステータスで検索し、注文 ID の一覧を返す）と `get_order`（注文 ID から単一注文の詳細を照会する）です。2つの細部は意図的なものです。`search_orders` は注文 ID だけを返して金額を返さないので、エージェントは注文ごとにもう一度 `get_order` を呼ばざるを得ません——レポートの「呼出」列がこの設計上の欠陥を暴きます。もう1つは、2つの絞り込み条件がどちらも空のときにエラーを投げることです。

```javascript
search_orders({ customer, status }) {
  if (!customer && !status) {
    throw new Error("無効なパラメータ: customer または status のうち少なくとも1つを指定してください");
  }
  // ...条件で絞り込み、{ order_ids: [...] } を返す
}
```

これが「無効なパラメータ」型のツールエラーです。公式ガイダンスは、この種のエラーがまとまって出るときは、たいていツール説明をより明確にするか例を足すべきだという意味だと述べています[^S3]。すぐあとでレポートの中に見ることになります。ツールエラーはクラッシュではありません——ツール実行のブロックが例外を捕まえ、`is_error: true` を付けた `tool_result` に包んでモデルに返し、カウンタを1つ増やします。`tool_use` と `tool_result` は `tool_use_id` で対応づきます——これは7つめのコースで敷いた土台で、ここではカウンタを2つ足しただけです。

## 部品2: スタブ client と検証のための幕間

ここで一度立ち止まる必要があります。そうしないと、以下の数字がすべて成り立たなくなります。

本物の Claude は非決定的です。同じプロンプトを2回走らせれば、経路がまったく違うこともあります[^S2]。本番では良いことですが、デモのレッスンにとっては致命的です——今日回して 3/5、明日は 4/5 では、その差がプロンプトの変更によるものかモデルの機嫌によるものか判別できません。そこで8つめと9つめのコースのハンズオンと同じ方法を採ります。**モデルを、決め打ちのキュー順に応答を返すスタブに差し替える**ことで、テスト対象の挙動を統制された変数にするのです。これで検証されるのは、あなたが書いた制御ロジックであって、モデルのその日の調子ではありません。

```javascript
function stubClient(script, label) {
  if (!script) throw new Error(`[stub] ${label} の応答キューがありません`);
  let cursor = 0;
  return {
    messages: {
      async create() {
        if (cursor >= script.length) {
          throw new Error(`[stub] ${label} の応答キューが尽きました（${cursor} 回のリクエストを発行済み）`);
        }
        const res = script[cursor++];
        await sleep(res.latency_ms);
        return res;
      },
    },
  };
}
```

キューが尽きたらエラーを投げ、フォールバックの応答は返しません——ループが1回余計に回れば `Error: [stub] v1/t2-pending の応答キューが尽きました（1 回のリクエストを発行済み）` がすぐ見えます（これは t2 のキューから最後の応答を削って実際に出したエラー文です）。偽の `end_turn` がすり抜けることはありません。各応答は自前の `latency_ms` を持ち、スタブは実際にその時間だけ眠るので、「所要時間」の列はループが何ターン回ったかを測る指標になります。タスクごとに新しい client が自前のスクリプトとともに作られ、カーソルがタスクをまたぐことはありません。

**2つのプロンプトバージョンの差は、スタブの2つの応答キューに固定されています。** 現実のシナリオならシステムプロンプトを変えればモデルの挙動が追随しますが、ここにはモデルがないので、`SCRIPT_V1` と `SCRIPT_V2` をあらかじめ書き、v2 では2つのタスクで異なる応答を返させています——「v2 のプロンプトが効いてモデルはこう答えると仮定する」を、データとして符号化したわけです。

```javascript
// v2 は2つのタスクの応答だけを差し替える。バージョン差分はここに固定されている
const SCRIPT_V2 = {
  ...SCRIPT_V1,
  "t3-no-orderid": [
    finish("どちらのご注文でしょうか？注文番号（SO-1001 の形式）をお送りください。", [455, 32]),
  ],
  "t4-refund-note": [/* 入金時期を足したバージョン */],
};
```

スプレッド構文で v1 を継承し、変わった項目だけを列挙します——コードを読む人が差分の範囲を一目で把握できます。このトラックが**検証するのはトラック自身**です。検証器は正しく採点するか、指標は正確に記録されるか、レポートの計算は合っているか、2回の実行を比較できるか。実クライアントに差し替えても、トラックは変わりません——変わるのは数字が揺れ始めることだけです。

## 部品3: 評価セット——通常4件 + エッジケース1件

レッスン5では、評価セットは現実の分布に合わせ、エッジケースをカバーすべきだと述べました[^S5]。公式も、十分な複雑さでツールに負荷をかけない単純すぎるサンドボックス環境を避けるよう警告しています[^S3]。ここでは紙幅の都合で5件しか収めませんが、構成は本物の評価セットに従っています。

| タスク | 何をテストするか | 採点 |
| --- | --- | --- |
| `t1-total` | 複数ステップの集計: 一覧を検索し、それぞれの金額を取りに行く | 決定的 |
| `t2-pending` | 集合の絞り込み: 注文 ID がちょうどこれだけ、過不足なし | 決定的 |
| `t3-no-orderid` | **エッジケース**: ユーザーが注文番号を出していない | 決定的 |
| `t4-refund-note` | 自由記述テキスト: 顧客への返金案内 | LLM ジャッジ |
| `t5-missing-order` | ツールエラーの後、正直に報告し、データを捏造しない | 決定的 |

`t3-no-orderid` は特筆に値します。プロンプトは「あの注文のステータスを確認してください」——どれのことでしょうか。指定されていません。理想の挙動は、適当に1件推測して照会するのではなく、注文番号を尋ね返すことです。公式ドキュメントはこの挙動について慎重です。ユーザーのプロンプトに必須パラメータをすべて埋めるだけの情報がない場合、Claude Opus は欠けているパラメータを認識してそれを尋ねる可能性がはるかに高いが、この挙動は保証されない、とくにより曖昧なプロンプトや能力の低いモデルでは保証されない、と[^S6]。**「保証されない」挙動こそ、評価セットがカバーすべきものです**——保証されているものはテストする必要がありません。

```javascript
{
  id: "t3-no-orderid",
  grader: "決定的",
  prompt: "あの注文のステータスを確認してください。",
  verify: (r) => ({
    pass: r.toolCalls === 0 && r.answer.includes("？") && r.answer.includes("注文番号"),
    note: "パラメータが不完全なときはツールを一度も呼ばず、注文番号を尋ね返すこと",
  }),
},
```

`verify` が受け取る `r` には `answer` だけでなく `toolCalls`、`toolErrors`、`tokens` も入っているので、検証器はテキストだけでなく「終状態と主要な指標」をチェックできます。`t3` は実際に「ツールを一度も呼ばなかったこと」を、`t5` は「エラーがちょうど1回発生し、見つからないと正直に述べたこと」を確認しています——レッスン2の終状態優先は、これらのフィールドを通じて実現されます。`note` は人間のためのもので、タスクが落ちたときレポートが判定基準とエージェントの実際の応答を並べて表示します。

レッスン5の宿題で `{id, prompt, expected, verifier, rubricRef, tags, split}` のフィールド構成を使ったなら、ここで対応づけて混乱を避けてください。レッスン5の `verifier` はここでは `grader` と呼ばれ、表示専用です——実際の採点タイプは、そのタスクが `verify` 関数を持つか `judge: true` を持つかで決まります。`expected` の宣言的なアサーションは、ここでは `verify` 関数の本体に直接書かれます（タスクごとにアサーションの形が違うので、汎用のアサーション形式を設計するより関数として書くほうが簡単です）。`rubricRef` は、スイート全体でジャッジのケースが1件しかないため `JUDGE_PROMPT` としてインライン化しました。`tags` と `split` は簡潔さのため省いています。ホールドアウトの規律は「スコープ」の節でいつもどおり繰り返します。レッスン5の JSON が無駄になったわけではありません——それはこの `TASKS` 配列の宣言的な版です。前に進むということは、各アサーションを関数に翻訳するということです。

## 部品4: 階層化した採点、決定的が先

採点方法には順序があります。コードベースの採点は最も速く最も信頼でき、極めてよくスケールしますが、複雑な判断ではニュアンスを欠きます。LLM ベースの採点は速く柔軟で複雑な判断を扱えますが、まず信頼できることをテストしてからスケールさせます。人間による採点は最も柔軟で品質も最高ですが、遅くコストがかかるので可能なら避けます[^S5]。

したがってルールはこうです。**コードで採点できるものは決してジャッジに回さない。** ここでは5件のうち4件が `verify` を使い、ジャッジに回るのはあの自由記述テキストである `t4-refund-note` だけです——「この文章は顧客に送れるか」は文字列一致では答えられません。ジャッジの形はレッスン4に従います。ルーブリックは3項目に固定、出力フォーマットは JSON に固定、先に根拠、次にスコアです。

```javascript
const JUDGE_PROMPT = `あなたは採点者です。以下のルーブリックでこのカスタマーサポートの返信を採点してください。先に根拠、次にスコアです。
ルーブリック（各項目 0 か 1、平均を総合スコアとする）:
- 金額の正確さ: 返金額が明記され、注文金額と一致している
- 入金時期: 返金の入金時期が明記されている
- トーンの適切さ: そのまま顧客に送れる言い回しである
JSON のみを出力すること: {"reasoning": "...", "score": 0.0-1.0, "grade": "pass" | "fail"}
score >= 0.8 を pass とする。`;
```

どの点にも出所があります。ジャッジには先に根拠を書かせてからスコアを出させ、その推論は捨てる——これは採点の質を上げ、とくに複雑な判断を要するタスクで効きます[^S5]。出力は経験的または具体的であるべきで、純粋に定性的な評価にしてはいけません[^S5]。そして「単一の LLM 呼び出し、単一のプロンプト、0.0–1.0 のスコアと合否の出力」は、公式が自社のマルチエージェント・リサーチシステムで複数のジャッジ方式を試したうえで、最も一貫し人間の判断とも合致すると分かった組み合わせです[^S2]。

ここでのジャッジもスタブです。v1 の返信には入金時期が欠けており、3項目のうち2項目で 0.67、判定は fail。v2 はそれを足したので3項目すべてが当たり 1.00、判定は pass です。スコアはルーブリックと自己整合しています——二値の3項目を平均すれば 0、0.33、0.67、1.00 にしか着地しません。0.85 というスコアが出たら、それはジャッジがルーブリックの計算に従わなかったということです。ジャッジ自身もトークンを消費し、その消費はそのタスクのトークンに加算されます。`t4` はツールを1回しか呼んでいないのにトークンが低くないのはそのためです。

レッスン4の規律をもう1つ。作業したモデルが自分を採点してはいけません。公式は、まっさらなモデルインスタンスに結果を反証させよ——作業した本人が採点する側になってはいけない、と述べています[^S4]。コードの上では、ジャッジは自前の client、自前のシステムプロンプト、自前の messages 配列を使い、タスクのプロンプトと採点対象の返信しか見えず、エージェントのツール呼び出しのトランスクリプトは見えません。

## 部品5: ループとレポート

ループは7つめのコースのループそのままで、骨格は変えていません——実 API が要求する `model` と `max_tokens` を足し（スタブは無視します）、カウンタで包んだだけです。

```javascript
let response = await client.messages.create({ model: MODEL, max_tokens: 4096, system, tools: TOOLS, messages });
metrics.tokens += response.usage.input_tokens + response.usage.output_tokens;
while (response.stop_reason === "tool_use") {
  messages.push({ role: "assistant", content: response.content });
  const toolResults = await runToolUses(response.content, metrics);
  messages.push({ role: "user", content: toolResults });
  response = await client.messages.create({ model: MODEL, max_tokens: 4096, system, tools: TOOLS, messages });
  metrics.tokens += response.usage.input_tokens + response.usage.output_tokens;
}
```

`messages` は `runTask` の中のローカル変数です。関数が返れば消えます。それが「タスクはコンテキストを共有しない」の実装のすべてです——追加の仕組みは要らず、外に持ち出さないだけです。

指標について、公式のチェックリストはこうです。トップレベルの正確さに加えて、個々のツール呼び出しとタスクの総実行時間、ツール呼び出しの総数、トークンの総消費量、ツールエラーも集めること[^S3]。レポートの表の列は、このチェックリストにそのまま従っています。通過率が教えるのは「通ったかどうか」だけですが、これらの列は「どう通ったか」を教えます——通ったけれどツールを12回呼んだのと、2回で通ったのとでは、品質の水準が2つ違います。これらの列はそれ自体が診断でもあります。冗長なツール呼び出しが多いのは、たいていページングやトークン上限のパラメータを適正化すべきというサインです。無効なパラメータによるツールエラーが多いのは、たいていツール説明をより明確にするか、より良い例を足すべきというサインです[^S3]。演習ではこれを直接使います。

レポートが人間に読める形であること自体に価値があります。公式の提案はこうです。Claude には成功を主張させるのではなく証拠を示させること——テストの出力、実行したコマンドとその戻り値、あるいは結果のスクリーンショット。証拠を確認するほうが自分で検証を回し直すより速く、見ていなかったセッションにも効きます[^S4]。このレポートの表がその証拠です——PR の説明に貼るなり同僚に送るなりすれば、相手は回し直さずに判断できます。（表示上の唯一の落とし穴は、CJK の全角文字が幅2としてカウントされることです。素の `padEnd` では桁がずれるので、コードには幅を考慮した `pad` を用意してあります。）

```agentmentor-check
{
  "id": "vq-zh-06-shared-session",
  "label": "評価タスク全件で1つの長いセッションを共有する——これで動くのか？",
  "prompt": "同僚が eval-runner.mjs を見て、最適化を提案してきました。いまはタスクごとに新しい messages 配列を作って独立したループを回しているが、無駄だ。5件のタスクで1つの長いセッションを共有して順番に回せばいいのでは、と。理由は2つ挙げられました。先に照会した注文データを後で再利用できる（トークンの節約）、そしてモデルが「温まる」ので後のタスクほど良い答えが返る、というものです。この提案の根本的な問題は何ですか。",
  "whyHere": "このトラックの構造の中で最も「最適化」で削られやすいのがタスクの分離です。重複作業に見えますが、実際には結果を比較するための前提条件です。",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "問題は、そもそもトークンが節約できないこと。セッションを共有すると毎回のリクエストで過去のタスクの messages をすべて再送するので、入力トークンは線形に増える。",
      "correct": false,
      "feedback": "この半文は正しいです——長いセッションを共有すれば入力トークンは積み上がり、節約の計算は合いません。しかしそれは挙げられた理由が成り立たないというだけで、このやり方自体が使えない理由ではありません。仮に本当にトークンが節約できたとしても、この回し方で出たスコアは使えません。選択肢 c を見てください。"
    },
    {
      "id": "b",
      "text": "問題は、指標をタスクごとに切り分けられないこと。セッションを共有すると、ツール呼び出し回数、所要時間、トークンが混ざってしまい、レポートの表を埋められない。",
      "correct": false,
      "feedback": "指標の切り分けが難しくなるのは事実ですが、それは会計上の問題です。各タスクの境目に印を付けてカウンタをリセットすれば、切り分けて集計することは可能です。エンジニアリングの手段で解決できるものは根本原因ではありません。根本原因は c にあります。"
    },
    {
      "id": "c",
      "text": "問題は、タスクどうしが汚染し合うこと。評価タスクは独立したループを回すべきで、セッションを共有すると前のタスクが残したコンテキストが次に持ち越される。モデルは前のタスクで照会済みの注文データをそのまま使って答えるかもしれず、テストはそのタスク自身の能力を測らなくなる。さらにタスクの順序を変えると結果も変わり、2回の実行を比較できなくなる。",
      "correct": true,
      "feedback": "正しい。公式の指針は「評価タスク1件につきループ1本」であり、分離は無駄ではなく前提条件です。汚染には2つの層があります。1つは、テストしている対象そのものが変わってしまうこと——前のタスクが取ってきたデータがコンテキストに残っているので、次のタスクが関連する内容に触れると、ツールを呼ばずに前のコンテキストから直接答えてしまったり、無関係な古いコンテキストに引きずられて誤答したりします。そうなるとあなたが測っているのは「ツールを使えるか」ではなく「前のコンテキストをめくれるか」です。もう1つの層は、タスクが順序に依存するようになることです。順序を入れ替えたり途中の1件を消したりすると、残りのタスクのスコアがすべてずれ、トラックは唯一の目的——2回の実行を比較可能にすること——を失います。"
    }
  ]
}
```

## eval-runner.mjs 全文

コピーして `eval-runner.mjs` として保存し、`node eval-runner.mjs` でそのまま動きます。依存なし、`package.json` なし、Node 18 以上（トップレベル `await` を使うので拡張子は `.mjs` である必要があります）。

```javascript
// eval-runner.mjs — タスクごとに harness ループを1本回す評価トラック
//
// 使い方:
//   node eval-runner.mjs                  修正後（正規化あり）の検証器を使う
//   node eval-runner.mjs --strict-verify  旧版の正規化なし検証器を使い、偽陰性を見る

const STRICT = process.argv.includes("--strict-verify");
const MODEL = "claude-opus-5"; // スタブは無視する。実クライアントに差し替えるときは model と max_tokens が必須パラメータ

// ============ 1. 被テストシステム: ツールとデータ ============

const ORDERS = {
  "SO-1001": { customer: "啓明テック", status: "complete", month: "2026-08", amount: 780.0 },
  "SO-1002": { customer: "啓明テック", status: "complete", month: "2026-08", amount: 500.0 },
  "SO-1003": { customer: "啓明テック", status: "pending", month: "2026-08", amount: 320.0 },
  "SO-1004": { customer: "遠山ロジスティクス", status: "pending", month: "2026-08", amount: 96.5 },
};

const TOOLS = [
  {
    name: "search_orders",
    description: "顧客名または注文ステータスで注文を検索し、注文 ID の一覧を返す。customer と status のうち少なくとも1つを指定すること。",
    input_schema: {
      type: "object",
      properties: { customer: { type: "string" }, status: { type: "string" } },
    },
  },
  {
    name: "get_order",
    description: "注文 ID から、その注文の顧客・ステータス・金額を照会する。",
    input_schema: {
      type: "object",
      properties: { order_id: { type: "string" } },
      required: ["order_id"],
    },
  },
];

const TOOL_IMPL = {
  search_orders({ customer, status }) {
    if (!customer && !status) {
      throw new Error("無効なパラメータ: customer または status のうち少なくとも1つを指定してください");
    }
    const ids = Object.keys(ORDERS).filter(
      (id) =>
        (!customer || ORDERS[id].customer === customer) &&
        (!status || ORDERS[id].status === status)
    );
    return { order_ids: ids };
  },
  get_order({ order_id }) {
    const o = ORDERS[order_id];
    if (!o) throw new Error(`注文 ${order_id} は存在しません`);
    return { order_id, ...o };
  },
};

// ============ 2. スタブ client: 固定の応答キュー ============

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (s) => ({ type: "text", text: s });
const toolUse = (id, name, input) => ({ type: "tool_use", id, name, input });
const useTools = (blocks, [i, o]) => ({
  stop_reason: "tool_use",
  content: blocks,
  usage: { input_tokens: i, output_tokens: o },
  latency_ms: 40,
});
const finish = (s, [i, o]) => ({
  stop_reason: "end_turn",
  content: [text(s)],
  usage: { input_tokens: i, output_tokens: o },
  latency_ms: 40,
});

function stubClient(script, label) {
  if (!script) throw new Error(`[stub] ${label} の応答キューがありません`);
  let cursor = 0;
  return {
    messages: {
      async create() {
        if (cursor >= script.length) {
          throw new Error(`[stub] ${label} の応答キューが尽きました（${cursor} 回のリクエストを発行済み）`);
        }
        const res = script[cursor++];
        await sleep(res.latency_ms);
        return res;
      },
    },
  };
}

// ============ 3. 2つのシステムプロンプトとその応答キュー ============

const SYSTEM_PROMPTS = {
  v1: "あなたは注文アシスタントです。ツールで注文を照会し、ユーザーに答えてください。",
  v2:
    "あなたは注文アシスタントです。ツールで注文を照会し、ユーザーに答えてください。\n" +
    "ハードルールが2つあります:\n" +
    "1. ユーザーが注文番号を示していない場合、まず注文番号を尋ねること。推測して照会しないこと。\n" +
    "2. 顧客への返金案内には、返金額と入金時期を必ず記載すること。",
};

const SCRIPT_V1 = {
  "t1-total": [
    useTools([toolUse("tu_1", "search_orders", { customer: "啓明テック", status: "complete" })], [420, 60]),
    useTools(
      [
        toolUse("tu_2", "get_order", { order_id: "SO-1001" }),
        toolUse("tu_3", "get_order", { order_id: "SO-1002" }),
      ],
      [520, 88]
    ),
    finish("顧客「啓明テック」の 2026年8月の完了済み注文は2件（SO-1001、SO-1002）で、合計 ¥1,280.00 です。", [660, 52]),
  ],
  "t2-pending": [
    useTools([toolUse("tu_1", "search_orders", { status: "pending" })], [415, 46]),
    finish("現在未発送の注文は SO-1003 と SO-1004 です。", [500, 34]),
  ],
  "t3-no-orderid": [
    useTools([toolUse("tu_1", "search_orders", {})], [408, 38]),
    useTools([toolUse("tu_2", "get_order", { order_id: "SO-1001" })], [470, 44]),
    finish("注文 SO-1001 のステータスは完了済みです。", [560, 30]),
  ],
  "t4-refund-note": [
    useTools([toolUse("tu_1", "get_order", { order_id: "SO-1003" })], [430, 42]),
    finish(
      "お世話になっております。ご注文 SO-1003（金額 ¥320.00）のキャンセルを承りました。返金は元のお支払い方法へお戻しいたします。ご不便をおかけし申し訳ございません。",
      [540, 76]
    ),
  ],
  "t5-missing-order": [
    useTools([toolUse("tu_1", "get_order", { order_id: "SO-9999" })], [412, 40]),
    finish("システムで注文 SO-9999 が見つかりませんでした。注文番号が正しいかご確認ください。", [478, 36]),
  ],
};

// v2 は2つのタスクの応答だけを差し替える。バージョン差分はここに固定されている
const SCRIPT_V2 = {
  ...SCRIPT_V1,
  "t3-no-orderid": [
    finish("どちらのご注文でしょうか？注文番号（SO-1001 の形式）をお送りください。", [455, 32]),
  ],
  "t4-refund-note": [
    useTools([toolUse("tu_1", "get_order", { order_id: "SO-1003" })], [462, 42]),
    finish(
      "お世話になっております。ご注文 SO-1003（金額 ¥320.00）のキャンセル依頼を承りました。返金は元のお支払い方法へお戻しし、通常3〜5営業日でお手元に反映されます。ご不便をおかけし申し訳ございません。",
      [572, 94]
    ),
  ],
};

const SCRIPTS = { v1: SCRIPT_V1, v2: SCRIPT_V2 };

// ============ 4. ジャッジ: これもスタブ。0.0-1.0 と合否を出力する ============

const JUDGE_PROMPT = `あなたは採点者です。以下のルーブリックでこのカスタマーサポートの返信を採点してください。先に根拠、次にスコアです。
ルーブリック（各項目 0 か 1、平均を総合スコアとする）:
- 金額の正確さ: 返金額が明記され、注文金額と一致している
- 入金時期: 返金の入金時期が明記されている
- トーンの適切さ: そのまま顧客に送れる言い回しである
JSON のみを出力すること: {"reasoning": "...", "score": 0.0-1.0, "grade": "pass" | "fail"}
score >= 0.8 を pass とする。`;

const JUDGE_SCRIPTS = {
  v1: {
    "t4-refund-note": [
      finish(
        JSON.stringify({
          reasoning: "金額は注文と一致し、トーンも適切。ただし返金の入金時期が書かれておらず、顧客が見通しを持てない。3項目のうち1項目が欠落。",
          score: 0.67,
          grade: "fail",
        }),
        [286, 58]
      ),
    ],
  },
  v2: {
    "t4-refund-note": [
      finish(
        JSON.stringify({
          reasoning: "金額・入金時期・トーンの3項目をすべて満たしており、そのまま顧客に送れる。",
          score: 1.0,
          grade: "pass",
        }),
        [302, 46]
      ),
    ],
  },
};

async function judgeAnswer(task, answer, version, metrics) {
  const client = stubClient(JUDGE_SCRIPTS[version][task.id], `judge/${version}/${task.id}`);
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: JUDGE_PROMPT,
    messages: [{ role: "user", content: `【タスク】${task.prompt}\n【採点対象の返信】${answer}` }],
  });
  metrics.tokens += res.usage.input_tokens + res.usage.output_tokens;
  const verdict = JSON.parse(res.content.map((b) => b.text).join(""));
  return { pass: verdict.grade === "pass", score: verdict.score, note: verdict.reasoning };
}

// ============ 5. 評価セット: 通常4件 + エッジケース1件 ============

function amountsIn(s) {
  return [...s.replace(/[,，\s¥￥]/g, "").matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}
function orderIdsIn(s) {
  return [...new Set(s.match(/SO-\d+/g) ?? [])].sort();
}

const TASKS = [
  {
    id: "t1-total",
    grader: "決定的",
    prompt: "顧客「啓明テック」の 2026年8月の完了済み注文について、合計金額はいくらですか。",
    verify: (r) => ({
      pass: amountsIn(r.answer).some((n) => Math.abs(n - 1280) < 0.005),
      note: "回答に 1280 が含まれること（通貨記号・桁区切り・単位は許容）",
    }),
    strictVerify: (r) => ({
      pass: r.answer.includes("1280.00"),
      note: "回答に 1280.00 という文字列がそのまま含まれること",
    }),
  },
  {
    id: "t2-pending",
    grader: "決定的",
    prompt: "まだ発送されていない注文はどれですか。注文番号を挙げてください。",
    verify: (r) => ({
      pass: JSON.stringify(orderIdsIn(r.answer)) === JSON.stringify(["SO-1003", "SO-1004"]),
      note: "回答内の注文番号の集合が SO-1003 + SO-1004 と完全に一致すること",
    }),
  },
  {
    id: "t3-no-orderid",
    grader: "決定的",
    prompt: "あの注文のステータスを確認してください。",
    verify: (r) => ({
      pass: r.toolCalls === 0 && r.answer.includes("？") && r.answer.includes("注文番号"),
      note: "パラメータが不完全なときはツールを一度も呼ばず、注文番号を尋ね返すこと",
    }),
  },
  {
    id: "t4-refund-note",
    grader: "LLM ジャッジ",
    judge: true,
    prompt: "顧客が注文 SO-1003 のキャンセルと返金を申請しています。返信を書いてください。",
  },
  {
    id: "t5-missing-order",
    grader: "決定的",
    prompt: "注文 SO-9999 のステータスを確認してください。",
    verify: (r) => ({
      pass: r.toolErrors === 1 && /見つかりません|存在しません/.test(r.answer) && !/[¥￥]|円|ドル/.test(r.answer),
      note: "ツールエラーの後は見つからないと正直に伝え、金額を捏造しないこと",
    }),
  },
];

// ============ 6. タスク1件につき harness ループ1本 ============

async function runToolUses(content, metrics) {
  const results = [];
  for (const block of content) {
    if (block.type !== "tool_use") continue;
    metrics.toolCalls += 1;
    try {
      const out = TOOL_IMPL[block.name](block.input);
      results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out) });
    } catch (err) {
      metrics.toolErrors += 1;
      results.push({ type: "tool_result", tool_use_id: block.id, content: err.message, is_error: true });
    }
  }
  return results;
}

async function runTask(task, version) {
  const metrics = { toolCalls: 0, toolErrors: 0, tokens: 0 };
  const client = stubClient(SCRIPTS[version][task.id], `${version}/${task.id}`);
  const system = SYSTEM_PROMPTS[version];
  const messages = [{ role: "user", content: task.prompt }];
  const startedAt = Date.now();

  let response = await client.messages.create({ model: MODEL, max_tokens: 4096, system, tools: TOOLS, messages });
  metrics.tokens += response.usage.input_tokens + response.usage.output_tokens;
  while (response.stop_reason === "tool_use") {
    messages.push({ role: "assistant", content: response.content });
    const toolResults = await runToolUses(response.content, metrics);
    messages.push({ role: "user", content: toolResults });
    response = await client.messages.create({ model: MODEL, max_tokens: 4096, system, tools: TOOLS, messages });
    metrics.tokens += response.usage.input_tokens + response.usage.output_tokens;
  }

  const answer = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  let verdict;
  if (task.judge) {
    verdict = await judgeAnswer(task, answer, version, metrics);
  } else {
    const fn = STRICT && task.strictVerify ? task.strictVerify : task.verify;
    const out = fn({ answer, ...metrics });
    verdict = { pass: out.pass, score: out.pass ? 1 : 0, note: out.note };
  }

  return {
    id: task.id,
    grader: task.grader,
    pass: verdict.pass,
    score: verdict.score,
    note: verdict.note,
    answer,
    durationMs: Date.now() - startedAt,
    ...metrics,
  };
}

async function runSuite(version) {
  const rows = [];
  for (const task of TASKS) rows.push(await runTask(task, version));
  return {
    version,
    verifier: STRICT ? "strict（旧・正規化なし）" : "normalized（修正後）",
    rows,
    passed: rows.filter((r) => r.pass).length,
    total: rows.length,
    toolCalls: rows.reduce((n, r) => n + r.toolCalls, 0),
    toolErrors: rows.reduce((n, r) => n + r.toolErrors, 0),
    tokens: rows.reduce((n, r) => n + r.tokens, 0),
    durationMs: rows.reduce((n, r) => n + r.durationMs, 0),
  };
}

// ============ 7. レポート ============

const CJK = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/;
const width = (s) => [...String(s)].reduce((n, ch) => n + (CJK.test(ch) ? 2 : 1), 0);
const pad = (s, n) => String(s) + " ".repeat(Math.max(0, n - width(s)));
const padL = (s, n) => " ".repeat(Math.max(0, n - width(s))) + String(s);

function printReport(report) {
  console.log(`\n=== レポート · プロンプト ${report.version} · 検証器 ${report.verifier} ===`);
  console.log(
    pad("タスク", 18) + pad("判定方式", 16) + pad("結果", 8) + padL("スコア", 8) +
    padL("呼出", 6) + padL("エラー", 8) + padL("トークン", 12) + padL("所要時間", 12)
  );
  console.log("-".repeat(88));
  for (const r of report.rows) {
    console.log(
      pad(r.id, 18) + pad(r.grader, 16) + pad(r.pass ? "pass" : "FAIL", 8) +
      padL(r.score.toFixed(2), 8) + padL(r.toolCalls, 6) + padL(r.toolErrors, 8) +
      padL(r.tokens.toLocaleString("en-US"), 12) + padL(`${r.durationMs}ms`, 12)
    );
  }
  console.log("-".repeat(88));
  const rate = ((report.passed / report.total) * 100).toFixed(0);
  console.log(
    `通過率 ${report.passed}/${report.total} (${rate}%) · ツール呼び出し ${report.toolCalls} · ` +
    `ツールエラー ${report.toolErrors} · トークン ${report.tokens.toLocaleString("en-US")} · 合計 ${report.durationMs}ms`
  );
  const failed = report.rows.filter((r) => !r.pass);
  if (failed.length) {
    console.log("\n未通過の詳細:");
    for (const r of failed) {
      console.log(`  [${r.id}] 判定基準: ${r.note}`);
      console.log(`  Agent の回答: ${r.answer}`);
    }
  }
}

function printDiff(a, b) {
  console.log(`\n=== スコアの変化 ${a.version} -> ${b.version} ===`);
  console.log(pad("タスク", 18) + padL(a.version, 7) + padL(b.version, 7) + "  変化");
  console.log("-".repeat(50));
  for (let i = 0; i < a.rows.length; i++) {
    const x = a.rows[i], y = b.rows[i];
    let mark = "横ばい";
    if (!x.pass && y.pass) mark = "fail => pass";
    else if (x.pass && !y.pass) mark = "pass => FAIL";
    else if (y.score !== x.score) mark = `スコア ${(y.score - x.score).toFixed(2)}`;
    console.log(pad(x.id, 18) + padL(x.score.toFixed(2), 7) + padL(y.score.toFixed(2), 7) + "  " + mark);
  }
  console.log("-".repeat(50));
  console.log(`通過率 ${a.passed}/${a.total} -> ${b.passed}/${b.total}`);
}

// ============ 8. エントリポイント ============

const reportV1 = await runSuite("v1");
printReport(reportV1);
const reportV2 = await runSuite("v2");
printReport(reportV2);
printDiff(reportV1, reportV2);
```

## レッスン3の罠を回収する: 厳しすぎる検証器

レッスン3である罠を扱いました。公式の言葉そのままでは、フォーマット、句読点、妥当な言い換えといった本質的でない差異のせいで正しい応答を却下してしまう、厳しすぎる検証器を避けること[^S3]。常識のように聞こえますが、コードの上ではほぼ避けられません。厳しすぎる検証器が、いちばん書きやすいからです。

このトラックには1つ埋め込んであります。`t1-total` には検証器のバージョンが2つあり、旧版は `pass: r.answer.includes("1280.00")` です——盤石に見えます。正解は 1280.00 なのだから、回答にその文字列が含まれるかを見ればいい、と。`node eval-runner.mjs --strict-verify` を走らせてみます（以下は v1 のレポートだけを貼っています。v2 のレポートと差分表はいつもどおり出力されます）。

```text
=== レポート · プロンプト v1 · 検証器 strict（旧・正規化なし） ===
タスク            判定方式        結果      スコア  呼出  エラー    トークン    所要時間
----------------------------------------------------------------------------------------
t1-total          決定的          FAIL        0.00     3       0       1,800       126ms
t2-pending        決定的          pass        1.00     1       0         995        83ms
t3-no-orderid     決定的          FAIL        0.00     2       1       1,550       125ms
t4-refund-note    LLM ジャッジ    FAIL        0.67     1       0       1,432       125ms
t5-missing-order  決定的          pass        1.00     1       1         966        83ms
----------------------------------------------------------------------------------------
通過率 2/5 (40%) · ツール呼び出し 8 · ツールエラー 2 · トークン 6,743 · 合計 542ms

未通過の詳細:
  [t1-total] 判定基準: 回答に 1280.00 という文字列がそのまま含まれること
  Agent の回答: 顧客「啓明テック」の 2026年8月の完了済み注文は2件（SO-1001、SO-1002）で、合計 ¥1,280.00 です。
  [t3-no-orderid] 判定基準: パラメータが不完全なときはツールを一度も呼ばず、注文番号を尋ね返すこと
  Agent の回答: 注文 SO-1001 のステータスは完了済みです。
  [t4-refund-note] 判定基準: 金額は注文と一致し、トーンも適切。ただし返金の入金時期が書かれておらず、顧客が見通しを持てない。3項目のうち1項目が欠落。
  Agent の回答: お世話になっております。ご注文 SO-1003（金額 ¥320.00）のキャンセルを承りました。返金は元のお支払い方法へお戻しいたします。ご不便をおかけし申し訳ございません。
```

これも実際の実行結果です。`t1-total` の詳細を見てください。エージェントは「合計 ¥1,280.00」と答えています——金額は正しく、注文も正しく、言い回しも普通です。唯一の罪は 1 と 280 のあいだに桁区切りのカンマを入れたことで、そのせいで `includes("1280.00")` が false を返し、完全に正しい回答が fail と採点されました。

**ここで直すのは検証器であって、エージェントではありません。** レポートが教えるのは「t1 が fail」までで、誰のせいかは教えてくれません。見分ける方法は、詳細に載っているエージェントの実際の言葉を読むことです——レポートが生の回答を出力するのは、まさにそのためです。直し方は正規化です。完全一致についての公式の説明にも、すでにこの手順が含まれています。完全一致の評価は、通常は空白と大文字小文字を正規化したうえで、モデルの出力があらかじめ定めた正解と一致するかを測ります[^S5]。金額のシナリオではもっと洗う必要があります——通貨記号、桁区切り、単位。そこで修正後の検証器は先にノイズを洗い落とし、数値を取り出して数値として比較します。

```javascript
function amountsIn(s) {
  return [...s.replace(/[,，\s¥￥]/g, "").matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}
verify: (r) => ({
  pass: amountsIn(r.answer).some((n) => Math.abs(n - 1280) < 0.005),
  note: "回答に 1280 が含まれること（通貨記号・桁区切り・単位は許容）",
}),
```

`--strict-verify` を外してもう一度走らせると、`t1-total` は 0.00 から 1.00 に反転し、v1 のベースラインは 2/5 から 3/5 に戻ります——その間、エージェントは1文字も変わっておらず、スタブの応答キューも1文字も変わっていません。**スコアは変わったのに被テストシステムは変わっていない——これが「検証器の問題」を見分けるリトマス試験紙です。**

スコープについて余談を1つ。正規化は緩ければ緩いほど良いわけではありません。「1280 が含まれていそうなら合格」まで緩めると、エージェントが「注文は合計 1280 件、金額は不明」と答えても通ってしまいます。検証器は「無関係な差異は通し、実質的な誤りは止める」位置に座るべきで、その位置を見つける唯一の方法は実際の回答で試すことです。

## プロンプトを1か所変えて、スコアが動くのを見る

トラックの較正が済んだので、本番の作業に入れます。私が変えたのは1か所だけ——システムプロンプトに、v1 のあとへルールを2つ足しました。

```javascript
const SYSTEM_PROMPTS = {
  v1: "あなたは注文アシスタントです。ツールで注文を照会し、ユーザーに答えてください。",
  v2:
    "あなたは注文アシスタントです。ツールで注文を照会し、ユーザーに答えてください。\n" +
    "ハードルールが2つあります:\n" +
    "1. ユーザーが注文番号を示していない場合、まず注文番号を尋ねること。推測して照会しないこと。\n" +
    "2. 顧客への返金案内には、返金額と入金時期を必ず記載すること。",
};
```

この2つはでっち上げではありません。v1 のレポートの「未通過の詳細」から読み取ったものです。`t3` はパラメータが不完全なのに注文番号を推測したせいで落ち、`t4` は入金時期がないせいで減点されました。**レポートが言ったところを、あなたが変える**——トラックがある場合とない場合の、最も具体的な違いがこれです。トラックがなければ、プロンプトを変えたあと出力を眺めて「良くなった気がする」と思うだけです。トラックがあれば、「どれが良くなり、どれが横ばいで、後退したものはあるか」が数字3行になります。

再実行すると、差分表は冒頭の出力の最後の区画です。通過率は 60% から 100% へ、2件のタスクが fail から pass に反転し、残る3件は動きません。この後半の半文は前半と同じくらい重要です——この変更が、すでに動いていたものを壊さなかったと言っているからです。トラックがなければ、プロンプトを変えたあと出力を一度見て「良くなったように見える」と思うだけです。トラックがあれば、「どれが改善 / どれが横ばい / 後退はあるか」が数字の3行になります。

公式の言い回しではこうです。評価があれば、プロンプトエンジニアリングの影響をより確信を持って測定できる。ツール説明のわずかな改良でさえ、劇的な改善をもたらすことがある[^S3]。ここにはつかみ取れるお買い得もあります。エージェント開発の初期では、手の届く果実がまだ豊富にあるため変更は劇的な影響を持つ傾向があり——プロンプトを1回いじるだけで成功率が 30% から 80% に上がることもあり、これほど効果量が大きければテストケースが数件あるだけで変化を見つけられます[^S2]。いまタスクは5件しかありませんが、それは不足ではなく出発点です。

指標の列をもう一度見てください。v2 ではツール呼び出しが 8 から 6 に、ツールエラーが 2 から 1 に減り、トークンも1000近く下がっています。`t3` がもう闇雲に推測してツールを呼ばなくなったからです。**同じ変更が精度とコストを同時に改善した**——こういうことは、これらの列を一緒に記録して初めて見えるようになります。

## スコープ: このトラックが面倒を見るもの、見ないもの

**面倒を見るもの**: エージェント1つ、タスク1群、自分のマシンで1回走らせ、人間に読めるレポートを出す。

**実モデルへの差し替え**——トラックの構造は変わりません。`stubClient(...)` を `@anthropic-ai/sdk` の実クライアントに置き換えるだけです。`runTask` の中の while ループは1行も変わりません——すでに実 API の `stop_reason` / `tool_use` / `tool_result` の形に合わせて書いてあり、必須パラメータの `model` と `max_tokens` もすでに入っています（スタブは無視し、実クライアントは使います）。差し替え後に変わることが2つあります。エージェントは同一のプロンプトでも実行のたびに非決定的なのでスコアは揺れます[^S2]。1回の実行を読み込みすぎないでください。そして1周回すのにお金と時間がかかります。5件なら気になりませんが、200件なら並列度とコストを考える必要があります。

**面倒を見ないもの**: 評価を CI につなぎ、コミットごとに実行し、過去のバージョンと比較し、スコアがしきい値を下回ったらマージをブロックする——これらはよくあるエンジニアリングの実践で、実際うまく機能しますが、このレッスンでは展開しません。演習のレベル2で「2つのレポートを比較する」ところまでは一緒にやります。残りの段取りはあなたの CI の仕事です。

レッスン5の規律をもう1つ繰り返します。**ホールドアウトセットに向けてチューニングしないこと。** レポートに従ってプロンプトを変えていけば、数ラウンドでスコアは確実に上がります。しかしその上昇は「この5件のタスクでのスコア」でしかないかもしれません。公式の実践は、「訓練用」の評価に過適合していないことを確かめるためにホールドアウトのテストセットに頼ることです[^S3]。ですから実際のセットアップでは、タスクを2つの山に分けるべきです。1つは日々回して方向を示す山、もう1つは鍵をかけておき「このバージョンなら大丈夫だろう」と思ったときにだけ開ける山です——前者のスコアは航法で、後者のスコアは判定です。

最後に古い注意をもう1つ。自動評価は見逃します。人間のテスターは、評価が見逃すエッジケースを必ず引き当てます——珍しいクエリでの幻覚、システム的な障害、微妙なソース選択のバイアスです[^S2]。トラックが順調に回っていることは、自分で使うのをやめてよいという意味ではありません。

## 💻 演習

<!-- exercises -->

### レベル1: レポートを読む。急いでコードを直さない

コードは不要です。レッスン冒頭の2つのレポート（v1 のベースラインと v2 の変更後）に戻ってください。サマリー行はこうでした。

```text
v1: 通過率 3/5 (60%)  · ツール呼び出し 8 · ツールエラー 2 · トークン 6,743
v2: 通過率 5/5 (100%) · ツール呼び出し 6 · ツールエラー 1 · トークン 5,766
```

2つの表の全体を見ながら、次の3つの問いにそれぞれ3〜5文で答えてください。

1. `t1-total` はどちらのレポートでも通過していますが、ツール呼び出し回数が 3 で最多です。これは何の問題を示していますか。何を変えるべきですか。
2. v1 のツールエラーは 2、v2 は 1 です。この2つのエラーは同じ種類の問題ですか。それぞれ何を意味し、それぞれ直すべきですか。
3. このレッスンには3つめのレポート（`--strict-verify` のもの）があり、そこでは `t1-total` が 0.00 です。同じタスクが一方のレポートで 0.00、もう一方で 1.00——このスコアの差がエージェントではなく検証器の問題だと、どうやって見分けますか。

<!-- rubric -->

- 問い1では「`search_orders` が注文 ID しか返さず金額を返さないので、注文ごとにもう一度 `get_order` を呼ぶ必要がある」という因果を指摘し、注文数が増えれば呼び出し回数も増えることに触れ、S3 の読み方に沿って冗長な呼び出しを「ページング / 返却量のパラメータを調整すべき」サインとして特定していること。変更対象は**ツール**（`search_orders` にサマリーのフィールドを持たせる）に着地すべきで、プロンプトやエージェントではない。
- 問い2では2つのエラーの性質を区別していること。`t3` のものは**無効なパラメータ**のエラー（`search_orders({})`）で、S3 の読み方ではツール説明が不明確か例が足りないことを指し、直すべきもの。`t5` のものは注文そのものが存在しないケースで、このタスクが**意図的にテストしている**ことなので、エラーが出るのは期待どおり。「ツールエラーの数は少なければ少ないほど良い、ではない」と明示していること。
- 問い3では運用可能な判定基準を挙げていること。2つのレポートでエージェントの回答テキスト、呼び出し回数、トークンがすべて同一で、変わったのは検証器だけなので、変化は採点側から来ている。そして判断の根拠が、詳細に載るエージェントの実際の言葉を読み、回答が実質的に正しいことを確認することだと述べていること（1,280.00 と 1280.00 の違いは桁区切りだけ）。
- 3問ともコードは不要。コードを書いたが上記の判断に答えていないものは合格としない。

<!-- hint -->

問い1は「3 は多い」とだけ睨んでいても進みません。`search_orders` が何を返すかを見てください。返しているのは `{ order_ids: [...] }` ——注文 ID だけです。エージェントが金額を知りたいとき、`get_order` を1件ずつ呼ぶ以外に方法はあるでしょうか。

<!-- hint -->

問い3の鍵は変数の統制です。2つのレポートで `t1-total` の行を列ごとに比べてください。呼び出し回数、エラー回数、トークンは変わりましたか。それからどちらの詳細にも載っているエージェントの生の回答テキストを比べます。変わった列がある側に、問題があります。

<!-- answer -->

**問い1。** `t1-total` に3回のツール呼び出しが必要なのは、`search_orders` の戻り値の設計がそうさせているからです。返すのは `{ order_ids: ["SO-1001", "SO-1002"] }` だけで金額がまったく入っておらず、エージェントが合計を計算するには注文 ID ごとにもう一度 `get_order` を呼ぶしかありません。呼び出し回数は 1 + N（N はヒットした注文数）で、注文が4件なら平気に見えますが、顧客の注文が50件あればこのタスク1件で51回に達し、トークンも所要時間も線形に伸び、簡単にコンテキストの上限にぶつかります。

このサインに対する公式の読み方はこうです。冗長なツール呼び出しが多いのは、たいていページングやトークン上限のパラメータを適正化すべきというサインです[^S3]。具体的な修正は、`search_orders` にサマリーのフィールド（注文 ID + ステータス + 金額）を直接返させ、そのうえで1回の返却量を制御するページングのパラメータを足すことです。**変えるのはツールであって、プロンプトでもエージェントでもありません。** これは、通過率以外の指標を記録しなければならない理由の説明にもなっています——`t1` はどちらのレポートでも通過しているので、通過率だけを見ていたらこの問題には永久に気づけません。

**問い2。** 同じ種類ではありません。2つのエラーの性質は正反対です。

`t3-no-orderid` のエラーは、エージェントが注文番号のないまま `search_orders({})` を呼び、絞り込みパラメータが両方とも空だったのでツールが拒否したものです——これは**無効なパラメータ**のエラーです。公式の読み方は、この種のエラーがまとまって出るときは、たいていツール説明をより明確にするか、より良い例を足すべきというサインだ、というものです[^S3]。これは直すべきもので、v2 で「まず注文番号を尋ねる」を足したら消えました。プロンプトを変えないなら、別の方向として、ツール説明を固めるか、ツール定義に `strict: true` を足してパラメータの制約を API 層で効かせる手もあります[^S6]。

`t5-missing-order` のエラーは `SO-9999` を照会し、ツールが「注文が存在しない」と報告したものです。欠陥ではなく、このタスクがテストしていることそのものです——ツールエラーの後、エージェントは見つからないと正直に言うか、それとも金額を捏造するか。このタスクの検証器には `r.toolErrors === 1` と書かれており、**このエラーは必ず発生しなければならない**という意味です。エラー数が 0 になったら、それはテストが的を外したということです。ですからツールエラーの列は少なければ少ないほど良いわけではなく、エラーがどこから来たかによります。2種類を混ぜて「エラーが 2 から 1 に減った、改善だ」と読むのは、本物の修正と期待どおりの挙動を1つの数字にかき混ぜることです。

**問い3。** 判定基準は変数の統制です。2つのレポートで `t1-total` の行を列ごとに比べます——呼出は 3 対 3、エラーは 0 対 0、トークンは 1,800 対 1,800 で、エージェント側は何も変わっていません。次に詳細を見ると、`--strict-verify` のレポートはエージェントの実際の言葉として「……合計 ¥1,280.00 です。」を出力しています——金額は正しく、注文も正しく、言い回しも普通です。2回の実行のあいだで変わったのはあのコマンドラインフラグだけ、つまり採点側だけなので、スコアの差はすべて検証器から来ています。旧版は `includes("1280.00")` という文字通りの比較をしており、桁区切りのカンマにつまずいたのです。これはまさに公式が警告したエラーの型です——フォーマットや句読点の本質的でない差異で、検証器に正しい回答を却下させないこと[^S3]。変更対象は `verify` 関数です。検証器に合わせてエージェントを変えるのは、トラックの欠陥を被テストシステムに押し付けることです。

この判断ができるのは、レポートがエージェントの生の回答を詳細に出力しているからです。レポートが合否しか出さないなら、実際に何と答えたのかを見るために自分で1回回し直さなければなりません——レポートが証拠として機能するためには、元の材料を載せている必要があります[^S4]。

---

### レベル2: トラックに「2回の実行の比較」を足す

コードを書きます。動くものであること。`eval-runner.mjs` に2つ足してください。

1. **レポートの永続化**: `writeJsonAtomic(file, obj)` を追加し、9つめのコースのアトミック書き込み（先に `.tmp` に書いてから `rename`）で、1回の実行のレポートを JSON として保存します。コマンドラインは `--version v1 --out reports/v1.json` をサポートすること。
2. **`compare.mjs` を書く**: 2つのレポート JSON を読み、タスクごとのスコア差分（ベースラインのスコア、新しいスコア、差分、ステータス）を表示し、最後に通過率の変化を表示します。pass から fail に転じたタスクが1件でもあれば、サマリーを stderr に出し、非ゼロのコードで終了すること。

次の4つのコマンドを実行し、出力を貼ってください。

```text
node eval-runner.mjs --version v1 --out reports/v1.json
node eval-runner.mjs --version v2 --out reports/v2.json
node compare.mjs reports/v1.json reports/v2.json   # 終了コードは 0 のはず
node compare.mjs reports/v2.json reports/v1.json   # 終了コードは 1 のはず
```

（引数の順序を入れ替えるのは「新しいバージョンがベースラインより悪い」状況の再現で、非ゼロ終了の経路が本当に動くことを検証するためです。）

<!-- rubric -->

- `writeJsonAtomic` は「一時ファイルに書く + `fs.renameSync`」の2ステップであること。直接 `fs.writeFileSync(file, ...)` で済ませていないこと。ディレクトリを自動作成すること（`fs.mkdirSync(..., { recursive: true })`）。
- 永続化する JSON は単独の `compare.mjs` から読めること。最低限 `version`、`passed`、`total` と `rows` 配列を含み、各行に `id`、`pass`、`score` があること。**`durationMs` は書かないこと**——所要時間は毎回揺れるので、書くと2つの JSON が永久に一致しません。書くこと自体は誤りではありませんが、その場合は比較でこの列を無視すること。
- `compare.mjs` は配列のインデックスではなくタスクの id で2つのレポートを突き合わせること——タスクを追加・削除するとインデックスはずれます。
- エントリポイントを差し替えたら、孤立した `printDiff` を削除すること。変更後のファイルに呼ばれない関数を残さないこと。
- 終了コードは2段階。pass が fail に転じたら `process.exit(1)` とし、退行のサマリーは stderr へ。退行がなければ通常終了（0）。引数不足には別の非ゼロコード（たとえば 2）を使い、「使い方の誤り」と「退行あり」を区別してよい。
- 4つのコマンドすべての実際の出力を貼ること。3つめは 0、4つめは 1 で終了すること。

<!-- hint -->

アトミック書き込みは3行で済みます。考えすぎないでください。`fs.writeFileSync(file + ".tmp", JSON.stringify(obj, null, 2))`、そのあと `fs.renameSync(file + ".tmp", file)`。同一ファイルシステム上の `rename` はアトミックなので、`compare.mjs` が読むのは完全な旧ファイルか完全な新ファイルのどちらかで、書きかけを読むことはありません。

<!-- hint -->

退行を判定するときにスコアの差分を使わないでください。スコアが 1.00 から 0.67 に下がるのは低下ですが、合格ラインより上のままかもしれません（ジャッジのタスクの合格ラインは 0.8 です）。1.00 から 0.00 は確実に fail です。`pass` の真偽値を直接比べてください。`was.pass && !now.pass` が退行で、スコアの変化は別の列として表示します。

<!-- answer -->

**`eval-runner.mjs` を変更する。** ファイル先頭に import 2つとアトミック書き込みの関数を追加します。

```javascript
import fs from "node:fs";
import path from "node:path";

const STRICT = process.argv.includes("--strict-verify");

// アトミック書き込み: まず .tmp に書き、次に rename する。書きかけのファイルを compare.mjs に読ませない
function writeJsonAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}
```

そのうえで第8節のエントリポイントをまるごと差し替えます——一度に1バージョンだけ回し、指定されたファイルに書き出します。

```javascript
// ============ 8. エントリポイント ============
// 使い方: node eval-runner.mjs --version v1 --out reports/v1.json
const argOf = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const version = argOf("--version", "v1");
const out = argOf("--out", null);

const report = await runSuite(version);
printReport(report);

if (out) {
  writeJsonAtomic(out, {
    version: report.version,
    passed: report.passed,
    total: report.total,
    ranAt: new Date().toISOString(),
    rows: report.rows.map(({ id, pass, score, toolCalls, toolErrors, tokens }) => ({
      id, pass, score, toolCalls, toolErrors, tokens,
    })),
  });
  console.log(`\nレポートを ${out} に書き出しました`);
}
```

エントリポイントを差し替えると `printDiff` に呼び出し元がなくなります——**この関数はまるごと削除してください**。デッドコードとして残さないこと。ここから先その役目は `compare.mjs` のものです。`printDiff` は同じプロセスの実行で得た2つのレポートしか比較できませんが、`compare.mjs` は任意の2回の実行を、何日離れていても違うマシンでも比較できます。永続化のときに `durationMs` と `answer` を意図的に落としているのは、所要時間が毎回揺れ、生の回答が長すぎて、どちらも JSON の比較をノイズだらけにするからです。

**`compare.mjs` 全文:**

```javascript
// compare.mjs — 2つのレポートを読み、タスクごとのスコア差分を表示する。pass が fail に転じたら非ゼロで終了
// 使い方: node compare.mjs reports/v1.json reports/v2.json
import fs from "node:fs";

const [baseFile, headFile] = process.argv.slice(2);
if (!baseFile || !headFile) {
  console.error("使い方: node compare.mjs <baseline.json> <new.json>");
  process.exit(2);
}
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const base = read(baseFile);
const head = read(headFile);
const wasById = new Map(base.rows.map((r) => [r.id, r]));
const regressions = [];

console.log(`base ${baseFile} (${base.version})  ->  head ${headFile} (${head.version})`);
console.log("task".padEnd(18) + "base".padStart(6) + "head".padStart(7) + "delta".padStart(8) + "  status");
console.log("-".repeat(52));

for (const now of head.rows) {
  const was = wasById.get(now.id);
  if (!was) {
    console.log(now.id.padEnd(18) + "-".padStart(6) + now.score.toFixed(2).padStart(7) + "-".padStart(8) + "  新規タスク");
    continue;
  }
  const delta = now.score - was.score;
  let state = "横ばい";
  if (was.pass && !now.pass) {
    state = "退行 pass => FAIL";
    regressions.push(now.id);
  } else if (!was.pass && now.pass) {
    state = "改善 fail => pass";
  } else if (Math.abs(delta) > 1e-9) {
    state = delta > 0 ? "スコア上昇" : "スコア低下";
  }
  console.log(
    now.id.padEnd(18) + was.score.toFixed(2).padStart(6) + now.score.toFixed(2).padStart(7) +
    (delta >= 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)).padStart(8) + "  " + state
  );
}

console.log("-".repeat(52));
console.log(`通過率 ${base.passed}/${base.total} -> ${head.passed}/${head.total}`);
const missing = base.rows.filter((r) => !head.rows.some((n) => n.id === r.id)).map((r) => r.id);
if (missing.length) console.log(`新しいレポートに存在しないタスク: ${missing.join(", ")}`);

if (regressions.length) {
  console.error(`\n${regressions.length} 件のタスクが pass から fail に転じました: ${regressions.join(", ")}`);
  process.exit(1);
}
console.log("\npass から fail に転じたタスクはありません。");
```

（ここでは素の `padEnd` を使っても安全です。桁揃えの対象になる列はすべて ASCII のタスク ID と数字で、日本語のステータス語は行末にしか現れず整列に参加しないからです。列の中に日本語テキストが入る場合は、本文の幅を考慮した `pad` が引き続き必要です。）

**実際の実行結果。** 2回の評価実行のレポートは本文と同じなので、ここでは最後の1行だけを残しています。`exit code=` の行は、コマンドのあとに `echo "exit code=$?"` を付けて出したものです。

```text
$ node eval-runner.mjs --version v1 --out reports/v1.json | tail -1
レポートを reports/v1.json に書き出しました

$ node eval-runner.mjs --version v2 --out reports/v2.json | tail -1
レポートを reports/v2.json に書き出しました
```

順方向の比較。退行なし、終了コード 0:

```text
$ node compare.mjs reports/v1.json reports/v2.json
base reports/v1.json (v1)  ->  head reports/v2.json (v2)
task                base   head   delta  status
----------------------------------------------------
t1-total            1.00   1.00   +0.00  横ばい
t2-pending          1.00   1.00   +0.00  横ばい
t3-no-orderid       0.00   1.00   +1.00  改善 fail => pass
t4-refund-note      0.67   1.00   +0.33  改善 fail => pass
t5-missing-order    1.00   1.00   +0.00  横ばい
----------------------------------------------------
通過率 3/5 -> 5/5

pass から fail に転じたタスクはありません。
exit code=0
```

2つのファイルを入れ替え、「新しいバージョンが v2 の変更を巻き戻した」状況を再現します。非ゼロ終了の経路も動きます:

```text
$ node compare.mjs reports/v2.json reports/v1.json
base reports/v2.json (v2)  ->  head reports/v1.json (v1)
task                base   head   delta  status
----------------------------------------------------
t1-total            1.00   1.00   +0.00  横ばい
t2-pending          1.00   1.00   +0.00  横ばい
t3-no-orderid       1.00   0.00   -1.00  退行 pass => FAIL
t4-refund-note      1.00   0.67   -0.33  退行 pass => FAIL
t5-missing-order    1.00   1.00   +0.00  横ばい
----------------------------------------------------
通過率 5/5 -> 3/5

2 件のタスクが pass から fail に転じました: t3-no-orderid, t4-refund-note
exit code=1
```

実装の細部で2つ、覚えておく価値があります。1つはインデックスではなく `id` で突き合わせていること——`wasById` の Map がそれをやっており、あとで評価セットに新しいタスクを挿入しても、古いレポートと比較できます。もう1つは退行の判定にスコアのしきい値ではなく `was.pass && !now.pass` を使っていることです。`t4` が 1.00 から 0.67 に下がったのはスコアの低下であり**かつ**ジャッジの 0.8 の合格ラインを割っており、両方の条件が揃って退行です。いつかルーブリックを調整して合格ラインが動いても、このコードは変えずに済みます。

<!-- /exercises -->

## まとめ

- 評価の標準的な回し方は、プログラムからの直接 API 呼び出しと、シンプルなエージェント的ループ——**評価タスク1件につきループ1本**です。タスクは `messages` を共有しません。共有すれば前のタスクのコンテキストが次を汚染し、結果が比較できなくなります[^S3]。
- 各評価プロンプトは検証可能な結果と対にすべきで、検証器は完全一致の文字列比較からモデルに判定させるものまでのスペクトラムをなします——コードで採点できるものは決してジャッジに回しません。コードベースの採点が最も速く、最も信頼でき、極めてよくスケールするからです[^S3][^S5]。
- 自由記述テキストはジャッジへ。形は単一の呼び出し、単一のプロンプト、0.0–1.0 のスコアと合否の出力です。ルーブリックは先に根拠、次にスコアで、出力フォーマットは固定します[^S2][^S5]。
- レポートは通過率のほかに、タスクの所要時間、ツール呼び出し回数、トークン消費、ツールエラーを記録しなければなりません。これらの列はそれ自体が診断です——冗長な呼び出しはページング / 返却量のパラメータの調整を、無効なパラメータのエラーはツール説明の明確化を指します[^S3]。
- 厳しすぎる検証器は正しい回答を却下します。フォーマット、句読点、妥当な言い換えのどれもが文字通りの比較をつまずかせます。完全一致の前に正規化を行ってください[^S3][^S5]。スコアは変わったのに被テストシステムは変わっていない——それは検証器のせいです。
- トラックがあればプロンプト変更の影響が測定可能になり、わずかな改良でも劇的な改善をもたらすことがあります。序盤は効果量が大きいので、数件のケースで差を見つけられます[^S3][^S2]。レポート自体が他人にレビューされうる証拠であり、自分で検証を回し直すより速く、見ていなかったセッションにも効きます[^S4]。
- レポートに従ってプロンプトを変えればスコアは上がりますが、その上昇はこのタスク群の上でだけかもしれません。ホールドアウトセットに鍵をかけて過学習を防ぎましょう[^S3]。自動評価には盲点があり、人間のテスターは依然として評価が見逃すエッジケースを捕まえます[^S2]。

## このコースを終えたあとに

振り返ると、本筋はじつは短いものでした。レッスン1は「完了に見える」と「完了している」を切り分けました——実行できるチェックがなければ「完了に見える」が唯一のシグナルであり、あなた自身が検証の工程になってしまいます[^S4]。レッスン2は何を検証するかを定めました——エージェントは同じゴールにまったく違う妥当な経路で到達しうるので、終状態を評価し、軌跡をステップごとに照合しないこと[^S2]。レッスン3は「チェック」を、合否を出力する実行可能な決定的検証器に落とし、同時に厳しすぎる検証器が正しい回答を却下することも警告しました[^S3]。レッスン4は自由記述テキストを扱いました——ルーブリック、出力フォーマット、そして作業したモデルが自分を採点してはいけないこと[^S2][^S4]。レッスン5は「何件で検証するか」を解きました——現実のタスク20件ほどで始められる、数百件たまるのを待つ必要はない[^S2]。そしてこのレッスンが、前の5つを300行のファイルに溶接しました。

そのファイルは複雑ではなく、実行に2秒もかかりませんが、変えるものは具体的です。今日からプロンプトのバージョンを変えたとき、「出力を何段落か読んで良くなった気がする」で判断する必要はありません——コマンドを1つ走らせれば、v1 から v2 への差分表があなたの代わりに語ります。ちょうど今回、`t3` と `t4` が緑になり、残る3件が横ばいだったように。次にあなたのエージェントが「完了しました」と言ったとき、その主張を検証するためのコマンド2つと終了コード1つが、あなたの手元にあります。

次にあなたのエージェントが「完了しました」と言ったとき、それを検証できる実行可能なトラックが、あなたにはあります。
