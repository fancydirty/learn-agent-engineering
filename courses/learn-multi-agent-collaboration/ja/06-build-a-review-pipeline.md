# レッスン6: ハンズオン: 2エージェントレビューパイプラインの構築

> 学習目標:
> - Claude API を使用して本当に実行可能なプロデューサー・レビュアーの2エージェントパイプラインを書く
> - レビュアーに包括的な「良さそうだ」ではなく、構造化されたチェック可能なレビュー結果を返させる
> - プロデューサーとレビュアーが永遠に磨き合わないように、ループに安全弁を設置する
>
> 前提: レッスン1〜5を完了し、基本的な JavaScript/Node.js を読むことができ、動作する Claude API キーを持っていること | 前: [レッスン5 <<](./05-failure-and-coordination.md)

## まず、結果: 1回の完全な実行

これはレッスンの終わりまでに実行できるようになるものです。ターミナルにタスクを渡すと、2つのエージェントがレビューが通るかラウンド制限に達するまで交代します。

```
$ node review-pipeline.js "Write an API change announcement for developers: the v2 endpoint changes the user_id field from a number to a string"

[Producer v1]
The v2 endpoint is here! Hugely improved experience — please switch to the new version soon.

[Reviewer round 1] Rejected. Issues:
- Doesn't spell out the specific field this change affects (never mentions that user_id goes from number to string)
- Gives no migration advice; developers don't know how to update their code
- "Hugely improved experience" is an unverifiable, exaggerated claim with no concrete basis

[Producer v2]
v2 API change notice: the user_id field type changes from number to string.
Check every piece of code that parses this field and switch the read logic from numeric to string,
to avoid parse failures caused by the type mismatch. This change takes effect in v2.1.0.

[Reviewer round 2] Approved

Final draft (approved in round 2):
v2 API change notice: the user_id field type changes from number to string.
Check every piece of code that parses this field and switch the read logic from numeric to string,
to avoid parse failures caused by the type mismatch. This change takes effect in v2.1.0.
```

最初のバージョンはレビュアーによって跳ね返され、各具体的な基準に紐付いた理由が示されます。プロデューサーは2番目のバージョンに修正し、レビュアーは再度確認し、今回は通ります。これはレッスン4の**プロデューサー・レビュアー**パターンをコードに変えたものです。"one LLM call generates a response while another provides evaluation and feedback in a loop."[^S2]

## 全体的な形: 実行ループと同じ骨格

このシリーズでAgent Tool Calling: Getting Agents to Actually Do Thingsコースを受けた場合、このパイプラインの骨格は馴染みがあるでしょう。ループ、ラウンドごとの1つの判定、続けるかどうかを決定する結果、さらに無限ループに対する安全弁です。唯一の違いは判定が何を判定するかです。そのコースのツール実行ループは「モデルはまだツールを呼び出したいか」を判定します（ループのセマンティクスはそのコースのレッスンThe Full Round-Trip of a Tool Callとその公式ソースにあります）。ここでは「レビュアーは合格と言ったか」を判定します。同じ骨格、ループ本体の内容が異なります。

パイプライン全体は3つの関数をつなぎ合わせたものです。`runProducer`はテキストを生成または修正し、`runReviewer`は基準に対してスコアを付けて具体的なメモを提供し、`runPipeline`は2つをループに結び付け、安全弁としてラウンドの上限を設定します。

## ステップ1: プロデューサー — タスクを受け取り、テキストを生成する

最初の実行では、プロデューサーはタスクそのものしか持っていません。却下後の2回目の実行では、**完全な前のバージョン**とレビューメモも運びます。そのため、プロデューサーはゼロから自由にスタイリングするのではなく、メモに従って最後のバージョンの上に修正します。

```js
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-5"; // アカウントが呼び出せるモデルに交換
const MAX_ROUNDS = 3; // 安全弁: プロデューサー・レビュアーは最大3ラウンド磨き、無限ループを避ける

async function runProducer(task, feedback, prevDraft) {
  const prompt = feedback
    ? `Task: ${task}\n\nYour previous version was:\n"""\n${prevDraft}\n"""\n\nThe reviewer rejected it with these notes:\n${feedback}\n\nRevise your previous version according to these notes. Return the full revised text only, with no extra explanation.`
    : `Task: ${task}\n\nReturn the text only, with no extra explanation.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content.find((b) => b.type === "text");
  return block ? block.text.trim() : "";
}
```

プロデューサーのプロンプトは独立しています。レッスン3でカバーしたように、サブエージェントはオーケストレーター側で何が起こったかを見ることができず、前回どうレビューされたかも見ることができません[^S3]。そのため、すべての呼び出しは「タスクが何か」「前のバージョンが何と言ったか」「（もしあれば）前のラウンドの問題が何だったか」をこの呼び出しのプロンプトに逐語的に書き込みます。プロデューサー自身の以前の下書きでさえ明示的に戻す必要があることに注意してください。これは独立性の原則の中で最も見逃しやすい半分です。Messages API はステートレスで、すべてのリクエストは必要な完全な履歴を運ばなければならず、サーバーはリクエスト間で何も保持しません[^S8]。「前のバージョンを修正する」は、前のバージョンが実際にこのプロンプトに書き込まれたときにのみ意味があります。

## ステップ2: レビュアー — 具体的な基準に対してスコアを付け、曖昧な評決をしない

レビュアーはモデルに「これは良いか」と尋ねるだけではありません。レッスン5でカバーしたように、検証は印象ベースのスコアではなく、具体的でチェック可能な基準に着地しなければなりません[^S1]。ここでレビュアーは明示的なチェックリストを取得し、固定された JSON フォーマットで返信することを要求されます。

```js
const REVIEW_CRITERIA = [
  "Does it clearly state the specific field or endpoint this change affects (not just 'something changed' or 'better experience')?",
  "Does it give concrete migration advice, telling developers how to update their code?",
  "Is the whole announcement kept under 150 words?",
  "Are there any unverifiable, exaggerated claims (like 'hugely improved' with no concrete basis)?",
];

async function runReviewer(task, draft) {
  const prompt = `You are the reviewer. You only find problems; you do not rewrite. Task requirements: ${task}

Review criteria (check each one; do not give a vague verdict):
${REVIEW_CRITERIA.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Text to review:
"""
${draft}
"""

Reply strictly in the JSON format below, with no text outside the JSON:
{"approved": true or false, "issues": ["list each criterion that failed, with the specific problem for each; if all pass, give an empty array"]}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content.find((b) => b.type === "text");
  return block ? block.text.trim() : "{}";
}
```

`approved`と`issues`フィールドが一緒になって**構造化されたレビュー結果**を構成します。単一の「大丈夫だ」ではなく、「合格か不合格か」プラス「失敗した各基準の背後にある具体的な問題」です。プロデューサーが`issues`を持っていると、曖昧な評決からどこに行くかを推測するのではなく、それらの具体的な問題を修正します。

## ステップ3: レビュー結果を盲目的に信頼しない — パース失敗を却下として扱う

`runReviewer`は文字列を返し、実際の JSON オブジェクトではないので、まだパースする必要があります。レビュアーが「厳密に JSON で返信する」ように言われていても、構造化出力の制約がなければ、モデルは依然として構文的に無効な JSON を生成したり、フィールドをドロップしたり、JSON をコードブロックで囲み、その周りにいくつかの説明行を追加したりする可能性があります[^S9]。ここでの罠は、パースが失敗したときに何が起こるかです。怠惰なルートを取る（パース失敗時にデフォルトで通す）と、「レビュアーが仕事をしなかった」失敗を静かに「レビュー合格」に変えます。それはまさにレッスン5が指摘したポイントです。「見える」完了した出力は実際に正しい出力と同じではなく、検証できないものは出荷すべきではありません[^S6]。ここでは逆を行います。パース失敗は常に**却下**としてカウントし、決して合格としてはカウントしません。

```js
function extractJson(raw) {
  // モデルは時々 JSON をコードブロックで囲む。最初にフェンスを剥がそうとする
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : raw.trim();
}

function parseReview(raw) {
  try {
    const parsed = JSON.parse(extractJson(raw));
    if (typeof parsed.approved !== "boolean" || !Array.isArray(parsed.issues)) {
      throw new Error("field shape is wrong");
    }
    return parsed;
  } catch (err) {
    return {
      approved: false,
      issues: [`Reviewer did not reply in the agreed format. Raw content: ${raw.slice(0, 200)}`],
    };
  }
}
```

`typeof parsed.approved !== "boolean"`と`!Array.isArray(parsed.issues)`の行は同じアイデアを拡張します。`JSON.parse`が成功しても、パースされたフィールドが正しい形を持っていることを確認し、間違ったフィールドタイプも却下としてカウントします。「少なくとも有効な JSON だ」からといって警戒を解かないでください。

一つの余談: レスポンスがスキーマに厳密に一致することをサンプリングレベルで保証する公式の構造化出力機能があります[^S9]。このレッスンは意図的に「素の呼び出しプラス自分の防御的なパース」スタイルを使用して、モデルの出力を盲目的に信頼できないことを直接感じるようにします。本番では構造化出力を使用してこの落とし穴を完全に取り除くことができます。

## ステップ4: ループに配線し、安全弁を追加する

`runProducer`、`runReviewer`、`parseReview`を手に入れたら、`runPipeline`は3つを一緒に配線し、`MAX_ROUNDS`はここでの唯一の安全弁です。プロデューサーとレビュアーは理論的には永遠に磨くことができるので、上限が必要です。

```js
async function runPipeline(task) {
  let draft = await runProducer(task);
  console.log(`[Producer v1]\n${draft}\n`);

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const review = parseReview(await runReviewer(task, draft));

    if (review.approved) {
      console.log(`[Reviewer round ${round}] Approved`);
      return { draft, rounds: round, approved: true };
    }

    console.log(`[Reviewer round ${round}] Rejected. Issues:\n- ${review.issues.join("\n- ")}\n`);

    if (round === MAX_ROUNDS) {
      return { draft, rounds: round, approved: false, issues: review.issues };
    }

    draft = await runProducer(task, review.issues.join("\n"), draft);
    console.log(`[Producer v${round + 1}]\n${draft}\n`);
  }
}

const task =
  process.argv[2] ??
  "Write an API change announcement for developers: the v2 endpoint changes the user_id field from a number to a string";

runPipeline(task)
  .then((result) => {
    if (result.approved) {
      console.log(`Final draft (approved in round ${result.rounds}):\n${result.draft}`);
    } else {
      console.log(
        `Hit the max round count (${MAX_ROUNDS}) without passing review. Emitting the last version for human review:\n${result.draft}\n\n` +
          `Issues left unresolved in the last round:\n- ${result.issues.join("\n- ")}`
      );
    }
  })
  .catch((err) => {
    // API 呼び出し自体も失敗する可能性がある（ネットワーク、認証、レート制限）。それも静かに飲み込まない
    console.error(`Pipeline run failed: ${err.message}`);
    process.exitCode = 1;
  });
```

まだ合格せずに`MAX_ROUNDS`に達したとき、`runPipeline`は「合格」の評決を強制しません。最後の下書きとまだ解決されていない問題を人間のレビューのために正直に引き渡します。これもレッスン5のポイントをクロージングステップに適用したものです。結果統合段階が判断できないものに遭遇したとき、コードで自分で決定することでそれを覆い隠すべきではありません。

```agentmentor-check
{
  "id": "mac-zh-06-invalid-review-json",
  "label": "レビュアーが合意されたフォーマットで返信しなかった — 何をすべきか",
  "prompt": "このパイプラインを実行している間、レビュアーが1回厳密な JSON で返信せず、代わりに「さっと見たが、コンテンツは基本的に良い」という行を追加し、`JSON.parse` がスローします。パイプラインを実行し続けるために、このパース失敗を合格レビューとして扱うべきですか。",
  "whyHere": "「とにかく合格として扱ってプログラムを実行し続ける」は、パースが失敗したときにまさに魅力的で労力の少ない動きです。これは、レッスン5の原則「合理的に見える出力は実際に正しい出力と同じではない」を使用してそのアイデアを押し戻し、自分で書いたコードにその原則を適用できるかをテストするスポットです。",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "はい — レビュアーは「基本的に良い」と言ったので、通してパイプラインが停止しないようにする",
      "correct": false,
      "feedback": "これはまさにレッスン5が警告した trust-then-verify gap です。レビュアーが合意された JSON フォーマットで返信しないということは、今回は基準ごとに標準に対してチェックしなかったことを意味し、自然言語の「基本的に良い」は構造化されたレビュー結果の代わりにはなりません。パース失敗を合格として扱うことは、「レビュアーが仕事をしなかった」失敗を静かに「レビュー合格」として再パッケージ化して提供します。"
    },
    {
      "id": "b",
      "text": "はい — プロデューサーのテキスト自体が良く見える限り、レビュアーが返信するフォーマットは重要ではない",
      "correct": false,
      "feedback": "レビュアーの返信フォーマットは、パイプラインが「合格か不合格か」を自動的に決定するために使用する唯一のシグナルそのものです。フォーマットを意のままに無視してまだ合格としてカウントできる場合、レビューステップは空洞の殻であり、設計した構造化されたレビュー基準は意味を失います。"
    },
    {
      "id": "c",
      "text": "いいえ — パース失敗は却下としてカウントすべき。生の返信を問題としてログに記録して再試行するか、人間にエスカレートする",
      "correct": true,
      "feedback": "正解です。間違ったレビュー結果フォーマットはそれ自体が「これを検証できない」状況であり、レッスン5の原則により、検証できないものは出荷すべきではありません。このレッスンの`parseReview`がそれを処理する方法がそれです。パース失敗は常に`approved: false`を返し、生のコンテンツを問題として記録するので、フローは静かに通すのではなく却下として続きます。"
    }
  ]
}
```

<!-- exercises -->
## 💻 演習

### レベル1: 実行してから、レビュー基準を追加する

このレッスンのコードを`review-pipeline.js`に組み立て、`npm install @anthropic-ai/sdk`を実行し、`npm pkg set type=module`を実行し、`ANTHROPIC_API_KEY`を設定し、このレッスンの例のタスクを1回実行します。「Approved」を見る前に少なくとも1回「Rejected」ラウンドを見ることを確認します。（プロデューサーの最初のバージョンがそのまま通過する場合、つまずきやすいタスクに交換します。例えば、意図的に「very short announcement」を求め、どれくらい短いかを言わないなど。）

実行したら、新しい基準を`REVIEW_CRITERIA`に追加します。「Does the text mention the specific version number where the change takes effect?」再度実行し、レビュアーの`issues`にこの新しい基準に紐付いたメモが含まれていることを確認します。

<!-- rubric -->
- パイプラインが実際に実行され、ログにプロデューサーの最初のバージョンと少なくとも1ラウンドのレビューメモが表示される
- 追加されたレビュー基準が本当にレビュー結果を変える — その情報が欠落している下書きがフラグされる
- 決して合格せずに`MAX_ROUNDS`に達した場合、パイプラインが最終的に何を出力するかを説明できる（クラッシュではなく、最後のバージョンと未解決の問題を引き渡す）

<!-- answer -->
`REVIEW_CRITERIA`配列にもう1つ項目を追加します。

```js
const REVIEW_CRITERIA = [
  "Does it clearly state the specific field or endpoint this change affects (not just 'something changed' or 'better experience')?",
  "Does it give concrete migration advice, telling developers how to update their code?",
  "Is the whole announcement kept under 150 words?",
  "Are there any unverifiable, exaggerated claims (like 'hugely improved' with no concrete basis)?",
  "Does the text mention the specific version number where the change takes effect?",
];
```

`runReviewer`や`runPipeline`のコードに触れる必要はありません。レビュー基準はテンプレート文字列を介してレビュアーのプロンプトにスプライスされるので、1つの配列要素を追加すると、レビュアーは次の呼び出しで新しい完全なリストを項目ごとにチェックします。プロデューサーの下書きがバージョン番号の言及を失敗し続ける場合、`issues`はこの基準の具体的なメモを運び、プロデューサーは次のラウンドでそのメモに修正します。

<!-- hint -->
プロデューサーの最初のバージョンがそのまま通過して「Rejected」ログ行を見ない場合、タスクはプロデューサーが満たすには簡単すぎます。レビュー基準をより厳しくするか、プロデューサーが最初のパスで見逃しがちな具体的な要件をタスクに追加してみてください。

<!-- hint -->
まだ合格せずに`MAX_ROUNDS`に達したとき、`runPipeline`の最後のストレッチを振り返ってください。スローしてプログラムをクラッシュさせません。`approved: false`プラス最後の下書きと問題リストで正常に返し、呼び出しコードが何をするかを決めるままにします。

### レベル2: わざと何かを壊してから修正する

以下の`parseReview`のバージョンには問題があります。まず、本当にレビューされなかった下書きを「承認済み」として通す状況を説明し、次に修正されたコードを提供してください。

```js
// 壊れたバージョン
function parseReview(raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    return { approved: true, issues: [] };
  }
}
```

<!-- rubric -->
- 問題を正確に名前を付ける: パース失敗時に`approved: true`を返し、「レビュアーが合意されたフォーマットで返信しなかった」失敗を「レビュー合格」として扱う
- これがもたらす具体的な結果を説明する（レッスン5の「盲目的に信頼できない」原則に結びつける）
- 修正はパース失敗のフォールバックを`approved: false`に変更し、生のコンテンツを`issues`に記録してトリアージまたはプロデューサーの再試行のために

<!-- answer -->
問題は、`catch`ブランチがフォールバックを`{ approved: true, issues: [] }`に設定することです。レビュアーが今回 JSON で返信しない場合（単に小さな雑談の行を追加しただけでも）、`JSON.parse`がスローし、`catch`ブランチは即座に「効果的にレビューされなかった」下書きを「承認済み」としてマークして通します。これはまさにレッスン5が警告したことです。「見える」完了した出力は実際に正しい出力と同じではなく、検証できない状況は合格結果として受け取られ出荷されるべきではありません。

修正は、パース失敗を常に却下としてカウントすることです。

```js
function parseReview(raw) {
  try {
    const parsed = JSON.parse(extractJson(raw));
    if (typeof parsed.approved !== "boolean" || !Array.isArray(parsed.issues)) {
      throw new Error("field shape is wrong");
    }
    return parsed;
  } catch (err) {
    return {
      approved: false,
      issues: [`Reviewer did not reply in the agreed format. Raw content: ${raw.slice(0, 200)}`],
    };
  }
}
```

<!-- hint -->
レビュアーが「合意されたフォーマットで返信しなかった」具体的なケースに自分を置いてください。フォールバックが「承認済み」の場合、その下書きは効果的なチェックなしで提供されており、レビュアーが実行されなかったのと変わりません。

<!-- hint -->
フォールバックが何であるべきかを決定するには、質問を反転させます。パース失敗は「問題がないことを確認した」に近いですか、それとも「問題があるかどうかを確認できない」に近いですか。レッスン5の答え: 確認できない場合は、問題なしとして扱わないでください。

<!-- /exercises -->

## まとめ

- プロデューサー・レビュアーパイプラインの骨格は実行ループと同じものです。ループ、ラウンドごとの1つの判定、続けるかどうかを決定する結果、さらに無限ループに対する安全弁です。このパターンの公式定義はまさに "one LLM call generates a response while another provides evaluation and feedback in a loop"[^S2] です。ここで判定は「ツールを呼び出すべきか」から「レビュアーは合格と言ったか」に切り替わります。
- プロデューサーのプロンプトは独立しています。すべての呼び出しはタスク、完全な前のバージョン、（もしあれば）前のラウンドの具体的な問題をプロンプトに逐語的に書き込みます。Messages API はステートレスで、すべてのリクエストは完全な履歴を運ばなければならず、リクエスト間で何も保持されません[^S8]。そのため、モデルが前のラウンドで何が起こったかを自分で覚えていることを頼りにすることはできません[^S3]。
- レビュアーは具体的でチェック可能な基準に対して項目ごとにスコアを付け、包括的な評決ではなく構造化された`{approved, issues}`を返します[^S1]。
- レビュアーが返すものも盲目的に信頼できません。パース失敗または間違ったフィールド形状は静かな合格ではなく却下としてカウントすべきです[^S6]。この原則は「サブエージェントが言うことを信頼する」だけでなく、「サブエージェントが返すデータフォーマットを信頼する」にも適用されます。
- まだ合格せずに最大ラウンド数に達したとき、パイプラインはコードで自分で合格を決定するのではなく、最後の下書きと未解決の問題を人間のレビューのために正直に引き渡すべきです。

このコースの6つのレッスンはすべてここまでです。「なぜ複数エージェントか」から始まり、オーケストレーターとサブエージェントがどう作業を分割するか、委任プロンプトをどう書くか、どのコラボレーションパターンがどのシナリオに適合するか、失敗をどう処理するかを経て、手作業で動作するプロデューサー・レビュアーパイプラインを構築することで終わります。次に最も価値のあることは説明を読み直すことではありません。手元にある小さな実際のタスクを選び、このパイプラインの骨格にドロップし、レビュー基準を調整し、実行して下書きが跳ね返されるかどうか、何回跳ね返されるかを確認することです。自分でレビュー基準を1回調整することは、理論を10回読み直すことに勝ります。
