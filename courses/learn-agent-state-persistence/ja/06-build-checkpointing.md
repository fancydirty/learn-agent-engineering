# レッスン6: ハンズオン: ハーネスにチェックポイントと再開を配線する

> 学習目標:
> - 「地点Aで宙ぶらりんな呼び出しを保存し、地点Bでクリアする」というチェックポイント方式を、概念図のままにせず、このシリーズの第7コースの`runAgent`ループへ実際に溶接する
> - `runToolUses`に副作用台帳を取り付け、ツールが成功したその瞬間にレコードを1件ディスクへ書き、再開が「このツールは実際に走ったのか否か」を判別できるようにする
> - `reconcile`の3分岐を書き、制御された「疑似キル＋`--resume`」の実行で、復旧が本来あるべき振る舞いをすることを自分の目で確かめる
>
> 前提: レッスン1〜5を読み、このシリーズの第7コース「Agent Harness Fundamentals: Loops and Control」のハーネスループを動かせること | 前: [レッスン5 <<](./05-rewind-and-fork.md)

## まず動かして見る

最初の5レッスンでは、チェックポイント、再開、冪等性、巻き戻しとフォークを一つずつ分解して説明してきました。このレッスンでは、それらを実際に動くハーネスへ溶接します。ループはいつもの見慣れたもの——`messages`でモデルを呼び、`stop_reason === "tool_use"`ならツールを実行してもう一度呼ぶ——ですが、今回は毎ターン2つのチェックポイントをディスクに書き、さらにツール実行結果を記録する台帳を持ちます。タスクは「営業メモをレポートにする」で、`read_notes`、`count_words`、`write_report`の3つのツールを順に呼びます。3ターン目まで正常に走り、そこで一気に落とされたときの様子はこうです。

```text
$ CRASH_AFTER=after-effect-write:3 node agent.js

[turn 1][save A] pending=read_notes
[turn 1][save B]
[turn 2][save A] pending=count_words
[turn 2][save B]
[turn 3][save A] pending=write_report
[kill] after-effect-write:3 で疑似キル
EXIT=137
```

1ターン目と2ターン目は`save A`→実行→`save B`の3ステップをどちらも完走しており、すべて正常です。3ターン目は`save A`を保存し（宙ぶらりんな呼び出しが`write_report`であることを記録し）、ツールも実際に実行を終え、その結果はすでに台帳へ書かれていました——しかし次のステップの`save B`が保存される前にプロセスが落とされました。これこそ、このレッスンが仕留めにいく窓です。この瞬間、`checkpoint.json`にはまだ宙ぶらりんな`pendingToolUse`が残っています。その場面を抱えたまま、`--resume`で拾い直します。

```text
$ node agent.js --resume

[resume] turn=3 pending=write_report を読み込み
[resume][reconcile] tool_use_id=toolu_03 name=write_report 台帳ヒット、結果を再利用、再実行しない
[turn 3][save B] 再開後にこのターンのツール結果を補完
[done] report.txt にレポートを書き出しました。タスク完了。
```

再開の流れは`turn=3 pending=write_report`を読み、台帳を確認します——するとこの呼び出しはキルの前に実際に完了して記録されていたとわかるので、そのレコードをそのまま再利用し、**`write_report`を再実行しません**。そしてこのターンに欠けていた`save B`を補い、いつもどおりモデルの締めくくりへ進みます。タスク全体が最初からやり直されることはなく、レポートが2回書かれることもありませんでした。

この2つのターミナル出力は手書きの例ではありません。後述の「検証ハーネス」セクションで固定のレスポンスキューによって駆動される Node スクリプトの実出力を、1行ずつそのまま写したものです。

## ブロックごとに組み立てる

### チェックポイントの読み書き: `saveCheckpoint` / `loadCheckpoint`

チェックポイントとは、この場面——`{version, task, turns, tokensUsed, messages, pendingToolUse}`——をディスクへシリアライズしたものにすぎません。唯一気をつけるべきはファイルを壊さないことです。まず一時ファイルへ書き、次に`fs.renameSync`でアトミックに入れ替えます。`rename`は同一ファイルシステム内では不可分の操作なので、「半分だけ書かれた」中間状態が存在しません。

```javascript
function saveCheckpoint(cp) {
  const tmp = CHECKPOINT_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cp, null, 2));
  fs.renameSync(tmp, CHECKPOINT_PATH);
}
```

読み込みは2つのことに耐えなければなりません。ファイルが存在しないこと（一度も実行していない、または最初から始めるつもりである）と、ファイルのパースに失敗することです。2番目のケースは特に慎重に扱う価値があります。`JSON.parse`の失敗はたいてい、前回の書き込み自体が中断されたことを意味します（`saveCheckpoint`は理屈の上ではアトミックですが、`.tmp`ファイルすら書き終わる前にプロセスが落とされたり、ディスク自体に問題があったりすれば、`rename`より前の中途半端なファイルが誤って読まれることはありえます）。その時点で、状態をこっそり空にリセットして何事もなかったふりをすることは絶対にやってはいけません。タスクが失われるのはまさにそこです。正しい振る舞いは、エラーを素直に投げ出し、このチェックポイントはもう信頼できないので削除して最初からやり直すべきだとユーザーに伝えることです。プログラムに推測で全体像を組み立てさせてはいけません。

```javascript
function loadCheckpoint() {
  let raw;
  try {
    raw = fs.readFileSync(CHECKPOINT_PATH, "utf8");
  } catch {
    throw new Error(`${CHECKPOINT_PATH}が見つかりません。--resume する対象がありません`);
  }
  let cp;
  try {
    cp = JSON.parse(raw);
  } catch {
    throw new Error(
      `${CHECKPOINT_PATH}のパースに失敗しました。書き込みの途中で中断されたファイルの可能性があります。使い続けるのではなく削除し、--resume なしで最初からやり直してください。半分だけ書かれたチェックポイントは推測で元に戻せません。`,
    );
  }
  if (cp.version !== 1) {
    throw new Error(`${CHECKPOINT_PATH}の version=${cp.version} です。このプログラムは version=1 しか受け付けないため、読み込みを拒否します。`);
  }
  return cp;
}
```

ついでに`version`フィールドも確認しておきます。後でチェックポイントの構造が変わったとき、古いファイルを新しいフォーマットとして無理やりパースすべきではありません。半分正しく半分間違った状態を読み出すくらいなら、読み込みを拒否するほうがましです。この2つの関数は実際に切り詰められた JSON でテスト済みです。半分だけ書かれた`{"version":1,"turns":3,"pendingT`を食わせると、`loadCheckpoint`は上記の「削除して最初からやり直せ」というエラーをきっちり投げ、もっともらしい既定値を返すことはありません。

### 地点Aと地点B: `runAgent`ループへの配線

このシリーズの第7コースのループの骨格は変わっていません——`while (response.stop_reason === "tool_use")`、`push assistant`→ツール実行→`push tool_result`→モデルへ再リクエスト。このレッスンではループ本体に2つのチェックポイントを差し込みます。その置き場所こそがこのレッスンの核心です。

```javascript
while (response.stop_reason === "tool_use") {
  if (turns >= MAX_TURNS) return `最大${MAX_TURNS}ターンに達したため、自主的に停止します`;
  turns++;

  const toolUseBlock = response.content.find((b) => b.type === "tool_use");
  // —— 地点A: モデルのレスポンスを受け取った直後、このターンの宙ぶらりんなツール呼び出しを記録する ——
  saveCheckpoint({
    version: 1, task, turns, tokensUsed, messages,
    pendingToolUse: { id: toolUseBlock.id, name: toolUseBlock.name, input: toolUseBlock.input },
  });

  messages.push({ role: "assistant", content: response.content });
  const toolResults = await runToolUses(response.content);
  messages.push({ role: "user", content: toolResults });

  // —— 地点B: ツール結果が messages に入り（台帳もディスク上にあり）、宙ぶらりんな呼び出しは解消 ——
  saveCheckpoint({ version: 1, task, turns, tokensUsed, messages, pendingToolUse: null });

  response = await client.messages.create({ tools, messages });
  tokensUsed += response.usage.input_tokens + response.usage.output_tokens;
}
```

地点Aは`response`が届いた後、`messages.push({ role: "assistant", ... })`の前に置かれます。モデルが「ツールを名指ししたが、まだ実際には実行していない」瞬間であり、`pendingToolUse`はその名指しをそのまま記録します。地点Bは`runToolUses`が終わり、`tool_result`が`messages`へ push された後に置かれます。その時点でこのターンは完全に締めくくられており、`pendingToolUse`は`null`にクリアされます。2つの保存に挟まれているのは、ツールが本当に実行されるコード区間そのものです。もしその区間の最中、あるいは直後にプロセスが死ねば、ディスクに残るのは「地点Aは保存済み、地点Bは未保存」という場面——`pendingToolUse`が空でない状態であり、これこそ復旧ロジックが処理するために作られた信号です。

この「宙ぶらりんな呼び出しは1つ」というプロトコル（`pendingToolUse`は配列ではなく単一のオブジェクト）が破綻しないよう、このレッスンではモデルが1ターンにちょうど1つのツールを名指しするようタスクを設計しています。これは意図的な単純化であり、その境界は「程度の問題」のセクションで明示します。

### 副作用台帳: `runToolUses`への配線

台帳が解決する問題はこうです。「ツールが実際に実行を終えた」と「結果が messages に着地した」のちょうど間にクラッシュが落ちたとき、この呼び出しがすでに走っていて再度走らせてはならないことを、再開はどうやって知るのか。やり方は、ツールが成功したその瞬間に、その結果を`tool_use_id`をキーとする台帳へ別途書き込むことです（ここでも一時ファイル＋`rename`のアトミックな書き込みを使います）。

```javascript
function saveEffect(toolUseId, entry) {
  const effects = loadEffects();
  effects[toolUseId] = entry;
  const tmp = EFFECTS_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(effects, null, 2));
  fs.renameSync(tmp, EFFECTS_PATH);
}

async function runToolUses(content) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const results = [];
  for (const block of toolUseBlocks) {
    let output;
    try {
      output = await toolImpls[block.name](block.input);
    } catch (err) {
      results.push({
        type: "tool_result", tool_use_id: block.id,
        content: `ツール実行エラー: ${err.message}`, is_error: true,
      });
      continue;
    }
    // 副作用はすでに起きている: たとえ台帳の書き込みが失敗しても、is_error で嘘をついては
    // ならない（それはモデルに新しい tool_use_id で再試行させ、副作用の重複を招く）——
    // 人間が対処できるよう、別途アラートを上げるだけにする
    try {
      saveEffect(block.id, { name: block.name, result: output, at: Date.now() });
    } catch (err) {
      console.error(`[台帳の書き込みに失敗] tool_use_id=${block.id}: 副作用はすでに起きています。再開時に重複実行のリスクがあるため、手動で確認してください`);
    }
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}
```

この順序は入れ替えられません。**まず`toolImpls[block.name](block.input)`の本物の結果を得て、そのうえで初めて`saveEffect`がそれを書き留められる**——実行が先、記録が後です。台帳が記録するのは「これは本当に起きた、そしてこれがその結果だ」ということです。逆にして実行前に記録したなら、台帳に着地しうるのはプレースホルダだけになり、台帳は「すでに完了した」という約束の意味を丸ごと失います（レベル2の演習では、このアンチパターンを自分の手で再現してもらいます）。

通常の単発実行では、`runToolUses`は「実行→記録」の2ステップを歩みます。各`tool_use_id`は初めて現れるので、引くべきものが何もないからです。再開が処理しなければならない唯一の宙ぶらりんな呼び出しは、より完全な「台帳を確認→（必要なら）実行→（実行したなら）記録」の3ステップを歩みます。次に見る`reconcile`がその3ステップの実装であり、どちらも同じ規律に従います。本物の結果を手にする前に「すでに完了した」を台帳へ書いてはならない、という規律です。

### `reconcile`: クラッシュ後の宙ぶらりんな呼び出しに対する3分岐

再開が処理しなければならないのは、チェックポイントの中にある（あれば）その1つの`pendingToolUse`です。それは3つの可能性に対応します。

```javascript
async function reconcile(cp) {
  const pending = cp.pendingToolUse;
  if (!pending) return null; // 宙ぶらりんな呼び出しなし、そのまま続行

  const effects = loadEffects();
  const hit = effects[pending.id];

  if (hit) {
    console.log(`[resume][reconcile] tool_use_id=${pending.id} name=${pending.name} 台帳ヒット、結果を再利用、再実行しない`);
    return { type: "tool_result", tool_use_id: pending.id, content: hit.result };
  }

  if (READ_ONLY.has(pending.name)) {
    console.log(`[resume][reconcile] tool_use_id=${pending.id} name=${pending.name} 台帳ミス、読み取り専用ツール、再実行する`);
    const output = await toolImpls[pending.name](pending.input);
    saveEffect(pending.id, { name: pending.name, result: output, at: Date.now() });
    return { type: "tool_result", tool_use_id: pending.id, content: output };
  }

  console.log(`[resume][reconcile] tool_use_id=${pending.id} name=${pending.name} 台帳ミスかつ副作用あり、判断不能、is_error を追加`);
  return {
    type: "tool_result", tool_use_id: pending.id, is_error: true,
    content: `この${pending.name}呼び出しの再開前の実行状態は不明です: 台帳にエントリがなく、副作用の重複を避けるため再実行していません。完了したかどうかをご自身で確認してください。`,
  };
}
```

3つの分岐は、いずれも実際にテストされた3つのシナリオに対応します。

- **台帳ヒット** — これはレッスン冒頭のクラッシュのデモです。`write_report`は実際に実行を終えて記録されており、`save B`だけが間に合いませんでした。再開時は台帳の結果をそのまま再利用し、再実行せず、レポートを2回書くことを避けます。
- **台帳ミス＋読み取り専用ツール** — `read_notes`のような、副作用のないツールです。記録が着地する前にクラッシュしても問題にならないので、もう一度走らせて結果を得て、ついでにこの実行を台帳へ記録します。
  ```text
  [resume][reconcile] tool_use_id=toolu_ro name=read_notes 台帳ミス、読み取り専用ツール、再実行する
  ```
- **台帳ミス＋副作用あり** — `write_report`のような、外部の状態を変えるツールで、記録が着地する前にクラッシュした場合です。それが実際に走ったかどうかはわかりません（実際のファイルシステム上では、`write_report`の副作用はすでに起きていて、ただ台帳に記録されなかっただけ、ということも十分にありえます）。ここでは推測するのではなく、`is_error: true`の`tool_result`でモデルに「この呼び出しの状態は不明だ」と正直に伝え、判断を差し戻します。
  ```text
  [resume][reconcile] tool_use_id=toolu_side name=write_report 台帳ミスかつ副作用あり、判断不能、is_error を追加
  ```

3つのログ行はすべて実出力であり、でっち上げではありません——`reconcile`自体はタスクが何であるかを知る必要がなく、`pendingToolUse`と対応する台帳の状態を与えれば、3つの分岐はそれぞれ独立にテストできます。

```agentmentor-check
{
  "id": "sp-zh-06-a-point-necessity",
  "label": "地点Bのチェックポイントだけを残して安全かを判断する",
  "prompt": "同僚がこのレッスンの2つのチェックポイント位置を見て、こう単純化を提案します。「どのターンも最後に地点Bで完全なスナップショットを取るし、地点Aが保存するフィールドは地点Bもすべて保存している。だから地点Aは落として、ツール結果が messages に入り台帳も書かれた後、ループの末尾で1回だけ保存すればいい。ディスク書き込みが1回減る」。この単純化は成り立つでしょうか。",
  "whyHere": "reconcile の3分岐を読み終えた直後です。ここで具体的な「地点Aを落とす」提案を投げることで、読み手が地点Aは何を記録しているのか、そしてなぜ地点Bだけではその穴を埋められないのかを本当に理解できているかを試せます。",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "成り立たない。クラッシュが「モデルがツールを名指しした」と「結果が記録された」のあいだに落ちた場合、地点Bにしか存在しないチェックポイントはその呼び出しについて何も知らないので、再開時に対応する tool_result を作れず、台帳を引く手がかりもない",
      "correct": true,
      "feedback": "正しい。プロトコルは、すべての tool_use が対になる tool_result を伴って返ることを要求します。チェックポイントを地点Bでしか保存せず、クラッシュが「モデルがツール呼び出しを出した」と「結果がコミットされた」の窓に落ちた場合、「このターンがそもそもツールを名指しした」という事実はディスク上のどこにもありません。台帳にエントリが欠けているという話ではなく、チェックポイント自体が宙ぶらりんな呼び出しの存在を知らないのです。reconcile には引くものも、選ぶ分岐もありません。地点Aがレスポンス到着の瞬間に呼び出しを記録するのは、まさにその窓の中で何が起きても記録に残すためです。"
    },
    {
      "id": "b",
      "text": "成り立つ。地点Bは地点Aが保存するフィールドをすべて保存しているのだから、地点Aを落としてもディスク書き込みが1回余分に減るだけで機能の損失はなく、ループから安全に取り除ける",
      "correct": false,
      "feedback": "これを「ファイル書き込みが1回減る」と捉えるのは、地点Aと地点Bが同じものを保存していないことを見落としています。地点Aが記録するのは「モデルがいまこのツールを名指しした、そしてまだ保留中である」、地点Bが記録するのは「このターンは完了して過去のものになった」です。地点Aを落として失われるのは冗長な書き込みではなく、ツールが実行されている窓の全体を記録する能力であり、その窓こそプロセスが最も落とされやすい場所です。"
    },
    {
      "id": "c",
      "text": "成り立たないが、その理由は地点Bのチェックポイントの書き込み頻度が足りないことだ。ツールの実行中にも地点Bのスナップショットを何度か余分に保存して、バックストップにすべきだ",
      "correct": false,
      "feedback": "問題は地点Bの保存頻度ではありません。地点Bの内容が反映しうる状態は「このターンは完了した」という1つだけです。地点Bのスナップショットを何枚取ろうと、そのすべてが同じ「事後」の情報を記録するのであって、「ツールが実行中でまだ終わっていない」という中間状態を再構成することは決してできません。足りないのは頻度ではなく、「名指ししたばかりで、まだ終わっていない」という事実そのものを記録するための専用の保存地点です。"
    }
  ]
}
```

### エントリポイント: `main()`の`--resume`

最後はエントリポイントです。`main()`が下す決定はちょうど1つ、コマンドラインに`--resume`があるかどうかです。あれば`loadCheckpoint()`を通して復旧し、なければ前回の残りのチェックポイントファイルと台帳ファイルを片付けて新規に始めます。この片付けによって、「`--resume`なしでやり直す」が常にきれいな出発点になり、前回の中途半端な場面に汚染されないことが保証されます。

```javascript
async function main() {
  const resume = process.argv.includes("--resume");
  const task = "sales-notes.txt を短いレポートにまとめて report.txt に書き出してください。";
  const tools = [];

  const client = resume ? makeStubClient([R4]) : makeStubClient([R1, R2, R3]);

  try {
    const result = await runAgent(client, task, tools, { resume });
    console.log(`[done] ${result}`);
  } catch (err) {
    if (err instanceof SimulatedCrash) {
      console.log(`[kill] ${err.message}`);
      process.exit(137);
    }
    throw err;
  }
}
```

`runAgent`の内部には対応する2つの経路があります。`opts.resume`が真のときは`loadCheckpoint()`を呼び、`reconcile`を走らせ、調整結果（あれば）を`messages`へ push して地点Bのチェックポイントを1つ保存し、そのうえでいつもどおりモデルへリクエストを送ります。偽のときは古いチェックポイントと台帳を`fs.rmSync`し、空の`messages`から始めます。本物の`agent.js`では、モデルクライアントが`@anthropic-ai/sdk`の`client.messages.create({ model, max_tokens, tools, messages })`に差し替わるだけで、構造はほかに何も変わりません。

## プロトコルを典拠として引く

このレッスンの2つの設計判断は、どちらも恣意的に決めたものではありません。

台帳が見つからず`reconcile`が状態を確信できないとき、黙ってスキップするのではなく`is_error: true`の`tool_result`を追加することを選ぶのは、コンテンツブロックのペアリングに関するプロトコルの厳格な要求に依拠しています。すべての`tool_use`は対になる`tool_result`を伴って返らなければならず、それらはまとめて返され、それぞれが`tool_use_id`で紐づけられます[^S4]。地点Aの保存を省けば、再開の流れはその呼び出しが起きたことすら知らないままになるので、そのペアリング規則を満たしようがありません。`reconcile`が存在する目的はまさに、台帳がヒットしようがミスしようが、宙ぶらりんな呼び出しが最終的に対になる`tool_result`を得ることを保証する点にあります。

「エラーで落として最初からやり直す」ではなく「再開して続ける」を選ぶことは、Anthropic のエンジニアリングチームが自社のリサーチシステムの振り返りで述べたことと響き合っています。エラーが起きたとき、単にやり直すことはできません。なぜなら "restarts are expensive and frustrating for users,"（やり直しは高くつき、ユーザーにとって苛立たしい）からであり、だから彼らは代わりに "built systems that can resume from where the agent was when the errors occurred"（エラーが起きた時点のエージェントの位置から再開できるシステムを構築した）のです[^S1]。同じ振り返りは、エージェントの適応力が決定論的なセーフガードと対立するものではなく、組み合わせられるものであることも述べています——"the adaptability of AI agents built on Claude with deterministic safeguards like retry logic and regular checkpoints"（Claude 上に構築された AI エージェントの適応力を、リトライロジックや定期的なチェックポイントのような決定論的なセーフガードと組み合わせる）[^S1]。チェックポイントは「プロセスが死んだ」という決定論的な失敗を受け止め、モデルの適応力は「台帳では判断不能」のような、コードでは決め打ちできない種類のケースを扱います。`reconcile`の`is_error`分岐は、その二つが出会う場所です。不明な状態について真実をモデルへ伝え、検証するか再試行するかをモデルに決めさせる——そして "letting the agent know when a tool is failing and letting it adapt works surprisingly well"（ツールが失敗していることをエージェントに知らせ、適応させるやり方は驚くほどうまくいく）のです[^S1]。

## 検証ハーネス

このレッスンの2つのターミナルデモは、実際にプロセスをキルして何が起きるかを見る、というやり方には依存していません。それではクラッシュのタイミングが毎回変わってしまい、「N回目のツール呼び出しの後にクラッシュし、復旧の振る舞いが正しい」といった狙いを定めたアサーションが立てられないからです。やり方は、モデルクライアントを、決まった順にカードを出すスタブへ差し替えることです。`messages.create`が呼ばれるたびに、あらかじめ書いておいたレスポンスを順に手渡すレスポンスキューを用意し、キューが尽きた後も呼び続けたら即座に投げるようにします。こうすれば、タスクがどのターンにどのツールを呼ぶか、モデルがいつ締めくくるかは、1回の実際の呼び出しによって動くことのない、ハードコードされた定数になります。

「プロセスをキルする」のは、環境変数で制御される`crashPoint(label)`です。`runToolUses`が台帳への書き込みを終えるたびに「これが何回目の書き込みか」を文字列ラベルへ縫い込み、`CRASH_AFTER`環境変数と突き合わせ、一致したら専用の`SimulatedCrash`例外を投げます。これによって「N回目のツール呼び出しの後にクラッシュ」が、タイミング任せの偶発事象ではなく、正確に指定できる整数になります。`main()`は最外層でこの例外だけを捕まえ、`[kill]`のログを1行だけ出して`137`（`SIGKILL`で落とされた場合の慣例的な終了コード）で終了するので、デモは醜いスタックトレースではなく本物のプロセスキルのように読めます。

この「レスポンスキューで内容を固定し、ラベルでクラッシュ回数を固定する」手法は、このシリーズの第8コース「Context Engineering: Spending Finite Attention Where It Counts」のレッスン6がコンテキストエンジニアリングを検証するのに使ったのと同じ発想です。ほうっておけば非決定的なもの（今回モデルが何を言うか、今回プロセスがどこで死ぬか）を先に固定量へ落とし込み、そのうえで初めて、毎回違う結果になるのではなく復旧の振る舞いを1行ずつアサートできるようになります。このレッスンが3つの分岐——「台帳ヒット、再実行しない」「読み取り専用ツールの台帳ミス、そのまま再実行」「副作用ありツールの台帳ミス、`is_error`を追加」——に加えて`loadCheckpoint`の切り詰めファイル耐性まで検証できたのは、この方法によるものです。いずれも机上で推論しただけでなく、実際の`node`実行で一つずつ確認しました。

## 程度の問題: すべてのタスクにこれが必要なわけではない

このレッスンで溶接した機構——2つのチェックポイント、1つの台帳、3分岐の`reconcile`——は、何ターンも続けて走り、その途中に副作用を持つ長いタスクのためのものです。数秒で終わり、失敗したら再実行すればよい小さなタスクは、このディスクI/Oと状態機械の一式を担ぐ価値がないかもしれません。ここではこのシリーズの第7コース「Agent Harness Fundamentals: Loops and Control」が引いたのと同じ程度の感覚を借りられます。検討に値するのは、"you should consider adding complexity only when it demonstrably improves outcomes"[^S3]（複雑さは、成果を明らかに改善する場合にのみ追加を検討すべき）という一点です。これは「必ずこうしなければならない」という厳格な規則ではなく、始める前に自分に問うべき質問に近いものです。このタスクは、チェックポイントを維持する価値があるほど本当に長く、本当に重要でしょうか。

このレッスンの実装は、明示的な境界も2つ引いています。「学んだらそのまま本番へ落とし込める」と受け取らないよう、口に出して言っておく価値があります。

- 各ターンが扱う宙ぶらりんな`pendingToolUse`はちょうど1つで、モデルが1ターンに1つのツールを名指しするデモタスクに合わせてあります。実際の現場では、1つのモデルレスポンスが複数の`tool_use`ブロックを同時に運ぶことは十分にありえます（このシリーズの第7コースの`runToolUses`は`Promise.all`でそれらを並行実行します）。このレッスンの「宙ぶらりんな呼び出しは1つ」というプロトコルを宙ぶらりんな呼び出しの集合へ拡張するとは、`pendingToolUse`をオブジェクトから配列へ変え、それぞれに対して`reconcile`を走らせるということです。このレッスンはその一層の複雑さを意図的に外しました。まずは単一の宙ぶらりんな呼び出しに対する調整ロジックをはっきり伝えきるためです。
- このレッスンのチェックポイントと台帳が管轄するのは「1プロセスが1タスクを走らせる」という一事だけです。複数のセッションが状態をどう共有するか、複数のプロセスが同じチェックポイントに同時に触れたら衝突するのか、マシンをまたいだ一貫性はどう保証されるのか——これらはマルチセッションの並行性と分散一貫性に属する話であり、このレッスンにも、このコースの範囲にも含まれません。

<!-- exercises -->
## 💻 演習

### レベル1: クラッシュ瞬間の訓練マニュアル

1ターンの中で、このレッスンのチェックポイントが捕まえうる「クラッシュの瞬間」は最大3つです。① 地点Aを保存した直後、ツールはまだ実行を開始していない。② ツールの実装関数はすでに終わっているが、台帳がまだ書かれていない。③ 地点Bを保存した直後。このレッスンが実装した`saveCheckpoint` / `saveEffect` / `reconcile`に対して、それぞれの瞬間を明確に書き出してください。クラッシュ後、`checkpoint.json`と`effects.json`はそれぞれどんな状態か。`--resume`したとき`reconcile`はどの分岐に入るか。そして中断されたのが読み取り専用ではない副作用ありのツール（たとえば`write_report`）だった場合、①と②のディスク上の観測可能な状態は同じか、復旧の振る舞いは同じか——同じだとしたら、それは何を意味するか。

<!-- rubric -->
- 瞬間①（地点A保存済み、ツール未実行）: `checkpoint.json` の `pendingToolUse` はこのターンの呼び出し。`effects.json` にはこの `tool_use_id` のレコードがない。再開時 `reconcile` は「台帳ミス」分岐に入り、読み取り専用ツールならそのまま再実行、読み取り専用でなければ `is_error` になる
- 瞬間②（ツール実行完了、台帳未書き込み）: `checkpoint.json` の状態は①とまったく同じ（`pendingToolUse` は依然として地点Aで保存されたもの）で、`effects.json` も①と同じくレコードがないため、再開時 `reconcile` は①とまったく同じ分岐に入る。「コードには①と②の区別がつかない」ことを指摘していること——②ではツールが実際に実行を終えている（たとえば `report.txt` はすでに書かれている）にもかかわらず、台帳が書かれていないために再開は状態不明として扱い、読み取り専用でないツールはそのまま再利用されるのではなく `is_error` になる。これこそ、台帳をツール成功の瞬間に書いてこの不確実性の窓を可能な限り狭める理由である
- 瞬間③（地点B保存済み）: `checkpoint.json` の `pendingToolUse` は `null`、`messages` にはこのターンの `tool_result` がすでに含まれている。`effects.json` には対応するレコードがある。再開時 `reconcile(cp)` は `pending` が空なので即座に `null` を返し、`runAgent` は「補完」のステップを行わず、完全な `messages` でそのままモデルへ再リクエストする

<!-- answer -->
瞬間①と②がディスクに残す状態はまったく同じです。`checkpoint.json`の`pendingToolUse`はどちらも地点Aで保存された呼び出しの記述のままで、`effects.json`にはどちらもこの`tool_use_id`のレコードがありません（唯一の違いは、②ではツールが実際に走り終えていることですが、その事実がまだどこにも永続化されていない、というだけです）。`reconcile`はディスク上の状態しか見ず、メモリの中で何が起きたかを知らないため、①と②はまったく同じ分岐を引き起こします。台帳からそのツールを読み出せないので、読み取り専用と判定されればもう一度走らせるだけ、副作用ありと判定されれば推測を避けて`is_error: true`の`tool_result`をモデルへ返す——副作用の重複を招きかねない答えを推測するくらいなら、不完全な情報を渡すほうがましだからです。

瞬間③はまったく別の経路です。`pendingToolUse`はすでに`null`で、`reconcile`は関数に入った瞬間に`null`を返し、`runAgent`の`if (reconciled)`の判定は偽となり、「ツール結果を追加し、地点Bをもう一度保存する」ブロック全体をスキップして、すでに完全な`messages`のまま次のモデルリクエストへ直行します——復旧の流れから見れば、このターンはとっくに締めくくられているのです。

<!-- hint -->
まず「コードに見えるもの」と「世界で実際に起きたこと」を分けて考えてみてください。瞬間②ではツールは明らかに実行を終えていますが、その事実が`checkpoint.json`にも`effects.json`にも書かれていない限り、`reconcile`にはそれが起きたことを知る手立てがありません。

<!-- hint -->
どの分岐に入るかの判定に必要なのは、2つのディスクファイルから得られる2つの値だけです。`cp.pendingToolUse`が`null`かどうかと、`effects.json`にこの`tool_use_id`があるかどうか。①②③それぞれについてまずその2つの値を書き出せば、分岐はおのずと決まります。

### レベル2: 台帳を逆順に書いてしまった順序の誤りを見つける

インシデントレポートにはこうあります。「ユーザーがタスクを中断し、`--resume`した後にツールが1つスキップされた。ログには『完了済み』と出ていたが、このツールは実際には一度も実行されておらず、書き出されるはずのファイルがそもそも存在しない」。当時本番で走っていた`runToolUses`を掘り起こすと、このレッスンのバージョンとの違いが1つ見つかります。

```javascript
async function runToolUses_prod(content) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const results = [];
  for (const block of toolUseBlocks) {
    saveEffect(block.id, { name: block.name, result: null, at: Date.now() });
    const output = await toolImpls[block.name](block.input);
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}
```

この順序の誤りを見つけ、なぜそれが「明らかに一度も走っていないツールが完了扱いされる」を引き起こすのかを明確に説明し、順序を修正してください。そのうえで、このレッスンの「検証ハーネス」セクションの方法に倣って、再現用の小さなスクリプトを書いてください。`saveEffect`と`toolImpls[block.name](...)`のあいだに環境変数で制御する疑似クラッシュ地点を挿入し、`node`で実際に走らせます——誤った順序ではクラッシュ前にすでに`result: null`のレコードが台帳に入っており、順序を修正すれば同じクラッシュ地点でこの`tool_use_id`のエントリは台帳にまったく存在しません。

<!-- rubric -->
- バグの指摘: `saveEffect` が `toolImpls(...)` より前に置かれており、その時点でツールは実際には実行されていないので本物の `output` が存在しえず、プレースホルダ（`result: null` のような）しか詰め込めない
- 帰結の説明: クラッシュがちょうど台帳の書き込みの後、ツールが実際に実行を終える前に落ちた場合、再開時に `reconcile` が台帳を確認してこのプレースホルダのレコードにヒットし、「台帳ヒット、結果を再利用、再実行しない」と判定する。一度も実際には実行されていない呼び出しを完了扱いし、`null` の結果で `tool_result` のペアリング要求を満たしてしまう。台帳が「まだ実行していない」を正直に反映していない
- 正しい順序の提示: まず `await toolImpls[block.name](block.input)` で本物の結果を得なければならず、それが成功した後に初めて `saveEffect` を呼んでその本物の結果を台帳へ書き、それから `tool_result` を push する。実行と記録の順序は入れ替えられない
- スクリプトによる検証: `saveEffect` と `toolImpls` のあいだに制御されたクラッシュ地点を挿入し、誤った順序と修正後の順序を `node` で走らせて、クラッシュ前に `effects.json` にこの `tool_use_id` がすでに書かれているかを観測する——誤った順序では書かれており（`result` はプレースホルダ）、修正後は書かれていない

<!-- answer -->
バグは、`saveEffect(block.id, { ..., result: null, ... })`が`const output = await toolImpls[block.name](block.input)`より前に書かれていることです。その時点ではツールはまだ呼ばれておらず、関数は本物の結果が何であるかを知る由もないので、`tool_use_id`の席を押さえるためにプレースホルダ（ここでは`null`）を詰め込むことしかできません。台帳の書き込みの後、`toolImpls`が実際に終わる前にプロセスが落とされると、ディスク上の台帳は「この`tool_use_id`にはすでにレコードがある」と示しますが、対応するツールは実際には一度も走っていません。再開時、`reconcile`は台帳にこのidがあるかどうかしか見ないので、それを見つけて「台帳ヒット」と判定し、そのレコードを再利用します——こうして、一度も実行されていない呼び出しが`null`の結果を持つ完了済みの呼び出しとして処理されるわけで、これこそインシデントレポートの「ツールがスキップされ、ログは完了と出ているのに、ファイルがそもそも存在しない」の原因です。

修正は、順序を「実行が先、記録が後」に戻すことです。

```javascript
async function runToolUses(content) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const results = [];
  for (const block of toolUseBlocks) {
    const output = await toolImpls[block.name](block.input); // まず実行し、本物の結果を得る
    saveEffect(block.id, { name: block.name, result: output, at: Date.now() }); // それから記録する
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}
```

検証はこのレッスンの「検証ハーネス」の線に沿って書けます。単一の`block`を扱う最小限のスクリプトを書き、`saveEffect`の後（誤ったバージョン）または`toolImpls`の後（正しいバージョン）に環境変数を読む`crashPoint`を挿入し、`node`で2回走らせて、クラッシュ後に`effects.json`にこの`tool_use_id`があるかを比較します——誤った順序ではクラッシュ前にすでに`result: null`のレコードが書かれており、正しい順序ではクラッシュ前の台帳には何もありません。

<!-- hint -->
台帳にレコードが存在することは、「このツールは本当に走り終わっており、これがその本物の結果だ」と等価であるはずです。逆から考えてみてください。記録のステップが実行より前に起きるなら、そのレコードはまだそれを保証できるでしょうか。

<!-- hint -->
検証スクリプトを組むのに`runAgent`全体を再構成する必要はありません。この1つの`block`の実行だけを単独で取り出し、環境変数で制御する`throw`を挿入し、走らせた後に台帳ファイルを読んでこのidがあるかを確認するだけで足ります。

<!-- /exercises -->

## まとめ

- チェックポイントは1ターンに2回保存します。地点Aはモデルのレスポンス到着後に宙ぶらりんな`pendingToolUse`を記録し、地点Bはツール結果が`messages`に着地した後にそれを null へクリアします。地点Bだけを保存すると、「モデルがツールを名指しする」から「結果が記録される」までの窓がチェックポイント上で完全に不可視になります。すべての`tool_use`は対になる`tool_result`を伴って返らなければならない以上[^S4]、その窓の中の宙ぶらりんな呼び出しを追跡可能にするものこそが地点Aです
- 副作用台帳は`tool_use_id`で記録し、その規律は「実行が先、記録が後」です。記録は本物の結果をすでに手にしていることを前提とします。逆にすれば「まだ走っていない」を「すでに完了した」と誤記録することになります
- `reconcile`の3分岐が再開時の宙ぶらりんな呼び出しを処理します。台帳ヒットなら再利用して再実行しない。台帳ミスだが読み取り専用ならそのまま再実行する。台帳ミスかつ副作用ありなら推測せず、`is_error`の`tool_result`を追加して状態を正直にモデルへ返す。これは「エラー時に最初からやり直すことはできず、当たった場所から再開しなければならない」と「ツールが失敗したことをモデルに知らせ、適応は任せると、驚くほどうまくいく」という2つのエンジニアリング上の教訓[^S1]と響き合い、「決定論的なセーフガードとモデルの適応力を組み合わせる」という考え方[^S1]とも一致します
- チェックポイントと台帳の機構はタダではありません。その複雑さが成果を明らかに改善するときにのみ追加してください[^S3]。このレッスンの実装が管轄するのは「1プロセスが1タスクを走らせる」ことだけであり、マルチセッションの並行性と分散一貫性はその関心事にも、このコースの範囲にも含まれません

これでこのコースは修了です。「エージェントはステートフルであり、エラーは積み重なる」という見立てから出発して、チェックポイントは何を保存すべきか、いつディスクへ書くべきか、再開時に宙ぶらりんな呼び出しをどう扱うか、冪等性がどう復旧を裏打ちするか、そしてチェックポイントがさらに巻き戻しとフォークにどう役立つかを、通しで歩いてきました。そしてこのレッスンで、それらを自分の手で、本当に動き、本当に落とされ、本当に拾い直して完走するハーネスへ溶接しました。いま手元にあるのは概念の集合だけではなく、実際の`node`実行で検証されたひとまとまりのコードです。これを自分のハーネスへ配線しておけば、次に本当に落とされたとき、それは中断したところからそのまま拾い直してくれます。
