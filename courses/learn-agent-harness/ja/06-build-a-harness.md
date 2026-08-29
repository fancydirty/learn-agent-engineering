# レッスン6: ハンズオン: 制御付きエージェントハーネスを手書きする

> 学習目標:
> - これまでのレッスンの `stop_reason` ループを `@anthropic-ai/sdk` の上で動く `while` ループとして書き、ツールを呼び続けるのか、テキストを返して切り上げるのかを自分で判断させられる
> - `tool_use` と `tool_result` の内容ブロックを仕様どおりに構築し、1ターン分の複数の結果を1つの `user` メッセージに入れて返せる
> - そのループに4つの制御弁 — 最大ターン数、予算上限、無進捗検知、高インパクトなアクションの承認 — を取り付け、それぞれがループのどのステップに属するかを正確に言える
>
> 前提: レッスン2から5を読み、`stop_reason` で駆動するループ、停止条件、暴走のフォールバック、ヒューマン・イン・ザ・ループの介入を理解していること | 前: [レッスン5 <<](./05-intervention-and-steering.md)

## まず、走っている姿を見る

最初の5つのレッスンは、機械を1つずつ分解してきました: ループはどう回るのか、いつ止まるべきか、暴走はどう見えるのか、人はどう割って入るのか。このレッスンでは、その部品を溶接して最小の動くハーネスにします。コードを見る前に、ターミナルでの振る舞いを見てください — 2つのおもちゃのツール（`get_time` は時刻を報告し、`read_file` はプロジェクト内のファイルを読む）を配線したエージェントに、一文を渡します: 「README.md の1行目を読んで、それから今何時か教えて」。

```text
$ node agent.js "README.md の1行目を読んで、それから今何時か教えて"

[turn 1] モデルがツールを要求: read_file({"path":"README.md"})
[turn 1] ツールの返り値: "# エージェントハーネスの基礎\n..."
[turn 2] モデルがツールを要求: get_time({})
[turn 2] ツールの返り値: "2026-08-26T10:42:07+08:00"
[turn 3] モデルが切り上げ (end_turn)

README.md の1行目は「# エージェントハーネスの基礎」で、いまは 2026年8月26日の 10:42 です。
ツール呼び出し2ターン、モデルへのリクエスト3回で終わりました。
```

ここで何が起きたかをよく見てください: **ユーザーは一文を言っただけで、ツールを何回呼ぶか、どれを先に呼ぶか、いつ止まるかは、すべてループの中でモデルが決めました。** それがエージェントとワークフローの分かれ目です — ワークフローの経路はコードで固定されているのに対し、エージェントはモデルが自分のプロセスを動的に主導し、どのツールを使うかを自分で決めるものです[^S1]。ホストコード（このレッスンで書くハーネス）は「先にファイルを読み、それから時刻を確認する」とは一言も指定していません。ただ忠実にループを回し、モデルが名指ししたツールを実行し、結果を返しただけです。ここでは2つのツールとも無害なので、実行は何にも中断されませんでした — しかしこのハーネスには承認弁も溶接されており、モデルがファイルの削除やリクエストの送信のような高インパクトなものに手を伸ばせば、動く前に止まって人間のうなずきを待ちます（レッスンの後半で書きます）。このレッスンの残りは、あのターミナル出力の裏にあるコードを1行ずつ組み立てていきます。

## コアループ: 骨格を持ち込み、本物の SDK に差し替える

レッスン2「コアループ: 一度の往復から継続的な運転へ」の `callModel` は擬似コードでした。いまそれが本物の `@anthropic-ai/sdk` になります。ループの骨格は同一です: `messages` を携えてリクエストを送り、`response.stop_reason` を見る — `"tool_use"` ならツールを実行し、結果を縫い合わせてもう一度送る。そうでなければ（たとえば `end_turn`）テキストを返してループを抜ける[^S2]。

まずは制御弁がまったくない最小版で、ループそのものを見えるようにします:

```javascript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // 環境変数 ANTHROPIC_API_KEY から鍵を読む

// あなたのアカウントで実際に使えるモデル id に差し替える
const MODEL = "claude-sonnet-5";

async function runAgent(userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    tools,
    messages,
  });

  while (response.stop_reason === "tool_use") {
    // このターンのモデルの完全な応答（assistant ロール）を履歴に追加する
    messages.push({ role: "assistant", content: response.content });

    // このターンのすべての tool_use ブロックを実行し、それぞれ tool_result に詰める
    const toolResults = await runToolUses(response.content, toolImpls);

    // 1ターン分の tool_result ブロックは、後続の1つの user メッセージにまとめて入れる
    messages.push({ role: "user", content: toolResults });

    // 長くなった履歴を携えてもう一度送る。制御は while の判定に戻る
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      tools,
      messages,
    });
  }

  // stop_reason はもう tool_use ではない — 最終的なテキストを取り出して返す
  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

これをレッスン2の骨格と並べると、構造は動いていません: `while` の行はいまも「`stop_reason` が `tool_use` であるかぎり繰り返す」と言っており、本体もいまも同じ4ステップ — assistant を push、ツールを実行、tool_result を push、`response` を再代入 — です。実質的な変更は `callModel` が `client.messages.create(...)` になったことと、本体の末尾のあの再代入だけです。その再代入こそが停止を可能にしているのであり、落とせば `stop_reason` は古い値のまま永遠に変わりません。それがまさに、レッスン4「暴走とフォールバック: デッドループ、空回り、予算バーンアウト」のデッドループです。

## tool_use / tool_result のフィールドを、1つも欠かさない

`runToolUses` は、モデルが名指ししたツールが実際に走る場所です。ここでいちばん間違えやすいのは内容ブロックのフィールドなので、仕様に従ってください: `tool_use` ブロックは `id` / `name` / `input` を持ち、`tool_result` ブロックは `tool_use_id`（どの呼び出しへの答えかを名乗る）と `content` を持ち、ツールの実行が失敗したときは `is_error: true` を足します[^S6]。もう1つ堅いルールがあります: 応答に `tool_use` ブロックがいくつ含まれていようと、同じ数の `tool_result` ブロックを返さなければならず、そのすべてを直後の1つの `user` メッセージに詰めます[^S6] — 上のループ本体の `messages.push({ role: "user", content: toolResults })` の行が、そのルールを守っています。

```javascript
async function runToolUses(content, toolImpls) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");

  // 並列で実行するが、結果は1つの user メッセージに集約される
  return Promise.all(
    toolUseBlocks.map(async (block) => {
      const impl = toolImpls[block.name];
      try {
        const output = await impl(block.input);
        return {
          type: "tool_result",
          tool_use_id: block.id, // 名乗り: これは id が block.id の呼び出しへの答えである
          content: output,
        };
      } catch (err) {
        return {
          type: "tool_result",
          tool_use_id: block.id,
          content: `ツールの実行に失敗しました: ${err.message}`,
          is_error: true, // 失敗時に立てる。呼び出しが成功しなかったことをモデルに伝えるため
        };
      }
    })
  );
}
```

`try/catch` に注目してください: ツールが吹き飛んだからといって、ハーネス全体を道連れにすべきではありません。エラーを `is_error: true` と印を付けた `tool_result` に包んで返せば、モデルは別の引数で再試行するか、別の道を取る機会を得ます。例外を投げてプロセスを殺すより、そのほうがはるかに安定します。

## 4つの制御弁を取り付ける

これでループは回りますが、レッスン2の裸のループ — モデルを信頼し、自分に逃げ道を残していないもの — のままです。モデルが `end_turn` を返したターンで止まり、その間には境界がどこにもありません。そしてエージェントの自律性は、より高いコストと、ループを一周するごとに誤りが累積増幅する可能性を意味し、モデルは多くのターンにわたって動作しうるのですから[^S1]、裸のループは止まるか続けるかの判断をまるごとモデルに賭けていることになり、危険すぎます。ここで、これまでのレッスンの4つの弁を1つずつ溶接していきます。

```javascript
const MAX_TURNS = 8;        // 弁1: 最大ターン数（レッスン3、停止条件）
const TOKEN_BUDGET = 40000; // 弁2: 累計トークン予算（レッスン4、予算バーンアウト）

async function runAgent(userInput, tools, toolImpls, opts = {}) {
  const messages = [{ role: "user", content: userInput }];
  let turns = 0;
  let tokensUsed = 0;
  let lastSignature = null; // 弁3 用: 前のターンのツール呼び出しの署名

  let response = await client.messages.create({
    model: MODEL, max_tokens: 1024, tools, messages,
  });
  tokensUsed += response.usage.input_tokens + response.usage.output_tokens;

  while (response.stop_reason === "tool_use") {
    // —— 弁1: 最大ターン数。本体の先頭に置き、この一周に入る前に「まだ回ってよいか」を問う ——
    if (turns >= MAX_TURNS) {
      return `最大ターン数 ${MAX_TURNS} に達したので、自分から停止します（タスクが難しすぎるか、モデルが行き詰まっている可能性があります）`;
    }
    // —— 弁2: 予算上限。累計トークンが天井に達したら停止し、財布を燃やし尽くさない ——
    if (tokensUsed >= TOKEN_BUDGET) {
      return `トークン予算 ${TOKEN_BUDGET} に達したので、自分から停止します`;
    }
    turns++;

    // —— 弁3: 無進捗検知。このターンのツール呼び出しの署名が前のターンと同一なら、空回りと判定 ——
    const signature = signatureOf(response.content);
    if (signature === lastSignature) {
      return `2ターン連続で同一のツール呼び出しでした（${signature}）。空回りと判定し、自分から停止します`;
    }
    lastSignature = signature;

    messages.push({ role: "assistant", content: response.content });

    // —— 弁4: 承認弁。高インパクトなアクションは実行前に確認を取る（下で展開します） ——
    const toolResults = await runToolUses(response.content, toolImpls, opts);
    messages.push({ role: "user", content: toolResults });

    response = await client.messages.create({
      model: MODEL, max_tokens: 1024, tools, messages,
    });
    tokensUsed += response.usage.input_tokens + response.usage.output_tokens;
  }

  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

各弁は1つのことを守っており、どの位置も適当に決めたものではありません:

- **弁1、最大ターン数**（レッスン3「停止条件: エージェントはいつ手を引くべきか」）: `turns >= MAX_TURNS` は本体の最も先頭、`turns++` の手前にあります。意味は「この一周に入る前に、もう一周が許されているかを確認する」です。この明示的な停止条件は、モデル自身の `end_turn` とは別に、制御を自分の手に握っておくために存在します[^S1]。
- **弁2、予算上限**（レッスン4「暴走とフォールバック: デッドループ、空回り、予算バーンアウト」）: 応答が返るたびに `response.usage` からトークンを積み上げ、天井で止めます。ターン数は少なくても1ターンあたりのコンテキストが巨大な場合、ターン数だけでは支出を押さえられません。トークンという独立した別のゲートが要ります。
- **弁3、無進捗検知**（レッスン4）: このターンのツール呼び出しを署名に平坦化し、前のターンと比べます。同一なら空回りです。これが捕まえるのは、ターン数は上限を超えておらず予算も破裂していないのに、モデルが足踏みして同じツールを同じ引数で何度も呼んでいる、という停滞したケースです。
- **弁4、承認弁**（レッスン5「介入と操舵: 中断、方向転換、ヒューマン・イン・ザ・ループ」）: `runToolUses` の中、実際にツールを実行する手前で、高インパクトなアクションはまず人間の確認を取ります。高インパクトなアクションへのヒューマン・イン・ザ・ループの承認は、まさに過剰なエージェンシーのリスクを抑える推奨手段です[^S4]。

弁3の署名関数は、退屈なほど素朴です — そのターンのすべての `tool_use` ブロックの名前と引数を1つの文字列に連結するだけ。「何がどんな引数で呼ばれたか」を区別できれば、それで十分です:

```javascript
function signatureOf(content) {
  return content
    .filter((b) => b.type === "tool_use")
    .map((b) => `${b.name}(${JSON.stringify(b.input)})`)
    .sort()
    .join(" | ");
}
```

## 承認弁: 実行の直前の瞬間に差し込む

4つの弁のうち、位置が最も重要で、最も間違えやすいのが承認弁です。モデルがツールを名指ししたが、そのツールはまだ実際には走っていない、というその瞬間に差し込まなければなりません — これから起きるアクションを表示し、人間を待ち、確認が取れてから実行します。1ステップ遅ければ、ファイルはすでに書かれ、リクエストはすでに送られ、「確認しますか？」と尋ねる意味はありません。というわけで、これは `runToolUses` の中、`impl(...)` の行の手前に置きます:

```javascript
const HIGH_IMPACT = new Set(["write_file", "http_post", "delete_file"]);

async function runToolUses(content, toolImpls, opts = {}) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");

  const results = [];
  for (const block of toolUseBlocks) {
    // 承認弁: 高インパクトなアクションは実行前に確認を取る
    if (HIGH_IMPACT.has(block.name)) {
      const ok = await opts.approve?.(block.name, block.input);
      if (!ok) {
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: "ユーザーがこの高インパクトなアクションを拒否したため、実行していません。",
          is_error: true,
        });
        continue; // 実行はスキップするが、tool_result は返す — 呼び出しを宙ぶらりんにしない
      }
    }

    try {
      const output = await toolImpls[block.name](block.input);
      results.push({ type: "tool_result", tool_use_id: block.id, content: output });
    } catch (err) {
      results.push({
        type: "tool_result", tool_use_id: block.id,
        content: `ツールの実行に失敗しました: ${err.message}`, is_error: true,
      });
    }
  }
  return results;
}
```

`approve` は外から渡される関数です。ターミナルでは「アクションを表示し、入力を1行読む」という意味になります:

```javascript
import readline from "node:readline/promises";

async function approveInTerminal(name, input) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `[approve] 高インパクトなアクション ${name}(${JSON.stringify(input)}) を実行しようとしています — Enter で許可 / n で拒否: `
  );
  rl.close();
  return answer.trim().toLowerCase() !== "n";
}
```

1つ重要な細部があります: ユーザーが拒否した場合でも、何も返さないのではなく `is_error: true` と印を付けた `tool_result` を返します。仕様は、すべての `tool_use` に対応する `tool_result` を返すことを要求しており[^S6]、飛ばせば1つのツール呼び出しに結果がないせいで次のリクエストがエラーになります。拒否は無視とは違います — 拒否それ自体がモデルに知らせるべき結果であり、拒否されたと学んだモデルは、そもそも高インパクトなアクションを必要としない道へ切り替えることがよくあります。

```agentmentor-check
{
  "id": "harness-zh-06-approval-before-exec",
  "label": "承認弁をループの制御フローの正しい位置に置く",
  "prompt": "同僚が承認弁をこう配線しました: runToolUses の中で、まずどのツールも通常どおり実行して出力を得る。そのうえで、結果が results に push される直前に、高インパクトなアクションについて「確認しますか？」と尋ね、ユーザーがノーと言えばその tool_result に is_error を付けて捨てる。彼はこう主張します: 「拒否されたら結果はどのみち捨てるのだから、同じことだ」。この配線は正しいでしょうか？",
  "whyHere": "この節は、承認弁がツールの実際の実行より前の瞬間に差し込まれなければならないと強調したばかりです。その直後に具体的なコード配置の誤り — 確認が impl の実行より後ろに移されたもの — を置くことで、弁が阻止するのは実行そのものであって結果を使うかどうかではない、と読者が本当に掴めているかを試します。",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "正しくない。承認は impl が呼ばれる前に完了していなければならず、先に実行してから尋ねるのでは副作用がすでに着地しているので、確認は何も阻止していない",
      "correct": true,
      "feedback": "正しい。承認弁が作用するのはアクションを実行すること自体であって、その結果を受け入れるかどうかではありません。だから impl(...) の行の手前に座らなければなりません — 承認が返ってきて初めて impl を呼び、拒否されたら impl に一切触れずに continue するだけです。それが高インパクトなアクションに対するヒューマン・イン・ザ・ループの承認の要点そのものです: 不可逆なアクションが実際に起きる前にゲートを保つのであって、起きたあとに無効の通知を出すことではありません。"
    },
    {
      "id": "b",
      "text": "正しい。拒否された tool_result はエラーとして印を付けられ使われないのだから、実行してもしなくても違いはない。先に実行してあとから尋ねても結果は同じ",
      "correct": false,
      "feedback": "正しくありません。問題は、ツールが本当にすでに走ってしまっていることです。write_file、http_post、delete_file のような高インパクトなアクションでは、impl が返った瞬間に副作用は着地しています — ファイルは書かれ、リクエストは出ていき、レコードは削除されています。その時点で「確認しますか？」と尋ねても、ゲートできるのはこの結果を使うかどうかだけであり、すでに起きた副作用はゲートできません。それでは承認弁はまったく何もしていないことになります。"
    }
  ]
}
```

## 2つのおもちゃのツールで、ループを実際に走らせる

弁は付きました。足りないのは、モデルが呼べるツールです。このレッスンでは絶対に安全なおもちゃを2つだけ使い、危険な操作は戸口の外に置いておきます: `get_time` は現在時刻を報告し、`read_file` はファイルを読みます — ただし `path.resolve` でプロジェクトディレクトリの内側にしっかり固定し、モデル（あるいはツール出力に進路を狂わされたモデル）が `/etc/passwd` のような境界外のパスを読みにいけないようにします:

```javascript
import path from "node:path";
import fs from "node:fs/promises";

const ROOT = process.cwd();

const toolImpls = {
  get_time: async () => new Date().toISOString(),

  read_file: async ({ path: p }) => {
    const abs = path.resolve(ROOT, p);
    // 境界チェック: 解決後の絶対パスは、なおプロジェクトディレクトリの内側でなければならない
    if (!abs.startsWith(ROOT + path.sep)) {
      throw new Error(`プロジェクトディレクトリ外のパスの読み取りを拒否しました: ${p}`);
    }
    return (await fs.readFile(abs, "utf8")).slice(0, 2000);
  },
};

const tools = [
  {
    name: "get_time",
    description: "現在時刻を ISO 8601 の文字列で返す",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "read_file",
    description: "プロジェクトディレクトリ内のテキストファイルの先頭 2000 文字を読む",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "プロジェクトルートからの相対パス" } },
      required: ["path"],
    },
  },
];
```

どちらのツールも `HIGH_IMPACT` の集合に入っていないので、承認は起動しません — 作りからして無害です。承認弁をデモするには、`write_file` を `toolImpls` と `HIGH_IMPACT` に足してください。このレッスンでは、例を走らせただけであなたのファイルが壊れないよう、本物の書き込み操作を意図的に導入していません。

## 組み立てる: node agent.js で走らせられるエントリポイント

最後に、`runAgent`、`runToolUses`、ツール定義、承認関数を、そのまま走らせられる1つのエントリポイントにまとめます — このレッスン冒頭のターミナル出力の裏にあるものです:

```javascript
async function main() {
  const userInput = process.argv[2] ?? "README.md の1行目を読んで、それから今何時か教えて";
  const answer = await runAgent(userInput, tools, toolImpls, {
    approve: approveInTerminal,
  });
  console.log("\n" + answer);
}

main().catch((err) => {
  console.error("harness がクラッシュしました:", err);
  process.exit(1);
});
```

ここまでの部品（`import`、`client`、`MODEL`、`runAgent`、`runToolUses`、`signatureOf`、`approveInTerminal`、`toolImpls`、`tools`、`main`）を1つの `agent.js` に入れ、`ANTHROPIC_API_KEY` を設定し、`npm i @anthropic-ai/sdk` を実行すれば、`node agent.js "あなたのタスク"` で走ります。

この百数十行を振り返ると、新しい概念は1つもないことに気づきます: `while` ループと `stop_reason` はレッスン2から、`MAX_TURNS` はレッスン3から、予算と空回り検知はレッスン4から、承認弁はレッスン5から来ています。**ハーネスは何か深遠なフレームワークではありません。あなた自身が書き、自分で制御する、このループ＋弁の層です。** 同じモデル、同じ2つのツールでも、この4つの弁を備えたハーネスとレッスン2の裸のループとでは、同じタスクをどれだけ安定して走らせられるかが大きく違いえます。エージェントが頼れるかどうかを決めているのは、内側のモデルだけでなく、この外側の制御コードの層だという部分が大きいからです[^S5]。

複雑さについては釣り合いの感覚も持っていてください: すべてのエージェントに4つの弁が要るわけではありませんし、覚えておく価値のある一文は、複雑さを足すのは結果を明確に改善するときだけにすべきだ、というものです[^S1]。統制された環境で3〜5ターン走る小さなツールなら `MAX_TURNS` だけで十分かもしれません。4つの弁は、何ターンも連続で走り、高インパクトなアクションに手を伸ばしうるケースのためのものです。

<!-- exercises -->
## 💻 演習

### レベル1: ハーネスにツールごとの段階的な制御弁を足す

いまの承認弁の設定は2つです: 高インパクトなら尋ね、それ以外はすべて通す。プロダクトの同僚が、もっと細かい要求を出しました — ツール名ごとに3段階で制御したい: `allow`（そのまま通す、`get_time` など）、`ask`（実行前に人間の確認が必要、`write_file` など）、`deny`（つねに拒否し、そもそも呼び出せない、廃止された `send_email` など）。このポリシー弁をハーネスに足してください: データ構造を設計し、ループのどのステップに属するか、既存の承認弁とどう関係するかを述べ、`deny` に当たったときにモデルへ何を返すべきかを書き出してください。

<!-- rubric -->
- 3段階を表現できるポリシー構造を示している（たとえば `{ get_time: "allow", write_file: "ask", send_email: "deny" }`）、そしてデフォルトの段階（未記載のツールがどの段階に落ちるか）を述べている
- ポリシー弁を `runToolUses` の中、`tool_use` ブロックごとに、impl の実行前に評価する位置に置いている — 承認弁と同じ位置であり、`ask` の段階は既存の確認ロジックを再利用する
- `deny` に当たったときはツールを実行しないが、それでも `is_error: true` の `tool_result` を返し、そのツールがポリシーで禁止されていることをモデルに伝える。黙って落とすのではない

<!-- answer -->
データ構造: ツール名から段階へのマップと、未記載のツールが落ちるデフォルトの段階です（保守的に、`ask` か `deny` のどちらをデフォルトにしても妥当です — `allow` をデフォルトにさえしなければ）:

```javascript
const POLICY = { get_time: "allow", read_file: "allow", write_file: "ask", send_email: "deny" };
const DEFAULT_POLICY = "ask"; // 未記載のツールは保守的に確認を要求する
```

位置: 承認弁が座っているのとまさに同じ場所 — `runToolUses` の中、各 `tool_use` ブロックを歩きながら、`impl` が呼ばれる前です。3段階のうち `ask` と `deny` の2つは、どちらもツールが実際に走る前に阻止しなければならず、それは承認弁が阻止するのと同じ瞬間です。実際これは承認弁の一般化です: 元のものは高インパクト = ask、それ以外 = allow という2段階に相当しており、そこにいま `deny` の段階が加わったわけです。

```javascript
for (const block of toolUseBlocks) {
  const policy = POLICY[block.name] ?? DEFAULT_POLICY;

  if (policy === "deny") {
    results.push({
      type: "tool_result", tool_use_id: block.id,
      content: `ツール ${block.name} はポリシーで禁止されているため、実行していません。`, is_error: true,
    });
    continue; // impl には一切触れない
  }
  if (policy === "ask") {
    const ok = await opts.approve?.(block.name, block.input);
    if (!ok) {
      results.push({
        type: "tool_result", tool_use_id: block.id,
        content: "ユーザーがこのアクションを拒否したため、実行していません。", is_error: true,
      });
      continue;
    }
  }
  // allow、または承認された ask: 実行する
  const output = await toolImpls[block.name](block.input);
  results.push({ type: "tool_result", tool_use_id: block.id, content: output });
}
```

`deny` に当たったときの肝は、承認が拒否されたときと同じです: 実行はしないが、それでも `is_error: true` の `tool_result` を返すこと。すべての `tool_use` には対応する結果を返さなければならないからです[^S6]。「このツールは禁止されている」と伝えられたモデルは、たいてい別のツールに切り替えるか、できないとユーザーに率直に伝えるかして、固まってしまうことはありません。

<!-- hint -->
まず自問してください: 3段階のうち、ツールの実行前に阻止しなければならないのはどれですか。`deny` と `ask` の両方です。`allow` は違います — したがってこの弁は承認弁と同じ場所、`impl(...)` の行の手前にしか置けません。

<!-- hint -->
拒否された呼び出しや承認されなかった呼び出しを宙ぶらりんにしないでください。仕様は、1ターンのすべての `tool_use` が次の user メッセージに `tool_result` を持つことを要求します。実行を拒むときも1つ返す必要があり（`is_error` の印を付けて）、さもないと結果が欠けているせいで次のリクエストがエラーになります。

### レベル2: このループに欠けているゲートと、どう暴走するか

同僚は下のハーネスのループを「動く」と言いますが、モデルが自分から `end_turn` を返さなくなった瞬間、あるいは足踏みに陥った瞬間に壊れます。指摘してください: (1) どの制御が欠けており、その欠落がそれぞれどんな暴走の振る舞いを生むか、(2) 最小限の修正 — ループが必ず止まることを保証するハードな境界を少なくとも1つ、そしてそれをどのステップに置くかを明確に述べる。

```javascript
async function runAgent(userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];
  let response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });

  while (response.stop_reason === "tool_use") {
    messages.push({ role: "assistant", content: response.content });
    const toolResults = await runToolUses(response.content, toolImpls);
    messages.push({ role: "user", content: toolResults });
    response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });
  }
  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

<!-- rubric -->
- 止まるか続けるかの判断をまるごとモデルの `stop_reason` に委ねており、明示的な停止条件がないことを指摘している — モデルが `tool_use` を返し続けるかぎり永遠に回るのであり、そこはまさに自律的なループにおいて制御を別途握っておくべき場所である
- 少なくとも2種類の暴走を挙げている: モデルが決して切り上げず、ターンが無制限に燃えること（ターン/予算の暴走）、そして同じツールを同じ引数で繰り返し呼ぶこと（無進捗）が検知されないこと
- 最小限の修正: `MAX_TURNS` のカウンターとチェックを足し、チェックはループ本体の先頭、`turns++` の手前に置き、ループが必ず止まることを保証する

<!-- answer -->
(1) 欠けている制御: モデル自身の `end_turn` のほかに、このコードには明示的な停止条件も、予算上限も、無進捗検知も、高インパクトなアクションの承認もありません。帰結を1つずつ見ます:

- **明示的な停止条件がない**: モデルが毎ターン `tool_use` を返すかぎり `while` の条件は真のままで、ループは永遠に回ります。エージェントの自律性はすでに、多くのターンにわたって動作しうること、コストの上昇、エラーの累積増幅を意味しており[^S1]、ここにはハードな境界が1つもありません — ひとえにモデルが行儀よく切り上げてくれることに依存しています。
- **予算上限がない**: 履歴は一周ごとに増え（レッスン2）、トークンは上がる一方で、長く走れば誰にも止められずに予算を燃やし尽くします。
- **無進捗検知がない**: モデルが同じツールを同じ引数で呼び続けて足踏みしても、このコードはそれをすべて受け入れ、空回りに気づくことはありません。
- **承認弁がない**: `toolImpls` に `write_file` のような高インパクトなものが含まれていれば無条件に実行され、たった1つの誤判断が不可逆な結果を生みえます。

(2) 最小限の修正: ループが必ず止まることを保証するハードな境界を少なくとも1つ足します — `MAX_TURNS` です。カウンターはループの外で初期化し、チェックは本体の最も先頭、`turns++` の手前に置きます:

```javascript
const MAX_TURNS = 8;
async function runAgent(userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];
  let turns = 0;
  let response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });

  while (response.stop_reason === "tool_use") {
    if (turns >= MAX_TURNS) return `最大ターン数 ${MAX_TURNS} に達したので、自分から停止します`; // ハードな境界、先頭に置く
    turns++;

    messages.push({ role: "assistant", content: response.content });
    const toolResults = await runToolUses(response.content, toolImpls);
    messages.push({ role: "user", content: toolResults });
    response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });
  }
  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

この1つを足すだけで、モデルが切り上げようと切り上げまいと、空回りしようとしまいと、ループは最大でも `MAX_TURNS` 周でかならず抜けます — 制御をモデルからホストの手に取り戻す、最も基本的な一歩です[^S1]。予算、無進捗、承認は、必要に応じてその上に重ねられます。

<!-- hint -->
`while (response.stop_reason === "tool_use")` の行を見つめてください: モデルが `end_turn` を返すことを選ぶ以外に、これを `false` にできるものが何かありますか。ないのなら、ループが止まるかどうかは完全にモデル任せです。

<!-- hint -->
「必ず止まる」境界は、モデルの出力とは無関係に、ホストが自分で維持するカウンターに依存します。そのカウンターをどこで初期化し、どこで増やし、どこでチェックすべきかを考えてください — チェックは増やす前です。1周多く通してしまわないためです。

<!-- /exercises -->

## まとめ

- 動くハーネスの中核は、いまもレッスン2のループです: `messages` を携えてリクエストを送る → `stop_reason` を見て、`tool_use` ならツールを実行し、`tool_result` を縫い合わせてもう一度送る。そうでなければテキストを返して切り上げる[^S2]。本物の SDK に切り替えても、`callModel` が `client.messages.create(...)` になるだけです
- 内容ブロックのフィールドは仕様どおり、1つも欠かしません: `tool_use` は `id` / `name` / `input` を、`tool_result` は `tool_use_id` / `content` を、失敗時にはさらに `is_error` を持ちます。1ターンに `tool_use` ブロックがいくつあろうと、同じ数の `tool_result` ブロックを返し、そのすべてを直後の1つの `user` メッセージに詰めます[^S6]
- 4つの制御弁はそれぞれ1か所を守り、位置は入れ替えられません: 最大ターン数（レッスン3）と予算上限（レッスン4）はループが必ず止まることを保証するハードな境界、無進捗検知（レッスン4）は足踏みを捕まえ、承認弁（レッスン5）はツールの実行より手前に差し込まなければなりません — エージェントの自律性はより高いコストとエラーの累積増幅をもたらし、モデルは多くのターンにわたって動作しうる[^S1]ため、モデル自身の `end_turn` では押さえきれないからです
- 高インパクトなアクションに人間の確認を要求する承認弁は、過剰なエージェンシーのリスクを抑える推奨手段です[^S4]。拒否された場合でも `is_error` の `tool_result` を返し、呼び出しを宙ぶらりんにしないでください[^S6]
- ハーネスは深遠なフレームワークではなく、あなた自身が書き、自分で制御する、このループ＋弁の層です — 同じモデルでも制御コードが違えば、信頼性は大きく変わりえます[^S5]。ただし弁を弁のために積み上げてもいけません: 複雑さを足すのは、結果を明確に改善するときだけにしてください[^S1]

このコースはこれで終わりです。「ハーネスとは何か」から、4つの制御弁を備えたループを手書きするところまで来て、いまあなたの手にあるのは概念の集まりだけではありません — 実際に走り、編集でき、これからも制御を足していける本物のコードです。自分のツールに配線して、あなたのために働かせてみてください。
