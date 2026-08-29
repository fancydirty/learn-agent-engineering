# レッスン3: チェックポイントからの再開: ループを再起動する

> 学習目標:
> - クラッシュ復旧の場面で「宙ぶらりんの呼び出し」が必ず現れる理由と、それが通常のツール実行失敗とどう別物なのかを言う
> - `loadCheckpoint()`からループに戻るまでの再開パスを、バージョンチェックと状態の再構築を含めて書く
> - 宙ぶらりんの呼び出しを、闇雲に再実行したり闇雲に削除したりするのではなく、ツールの性質——読み取り専用ツールはそのまま再実行、影響の大きいツールはまずフォールバック——に応じて突き合わせる
>
> 前提: レッスン2を終え、`checkpoint.json`のフィールドと2つの保存地点を理解していること | 前: [レッスン2 <<](./02-checkpoint-anatomy.md) | 次: [レッスン4 >>](./04-side-effects-idempotency.md)

## 再起動ではなく、再開する

エージェントが途中でクラッシュしたとき、最初に浮かぶのはたいてい「もう一度走らせる」です。しかし、すでに十数ターン進み、ツールを何度も呼んだ長時間タスクにとって、再起動は割に合わない取引です。"restarts are expensive and frustrating for users"[^S1]（再実行はコストが高く、ユーザーにとって苛立たしい）。レッスン2では実行中の場面を`checkpoint.json`に書き出しました——`version`、`task`、`turns`、`tokensUsed`、`messages`、`pendingToolUse`——モデルが応答した後（保存地点A）に一度、ツール結果が記録された後（保存地点B）に一度、保存します。本レッスンがやるのは、保存されたその場面を、前へ進めるループへと戻すことです。毎回最初からやり直すのではなく、"resume from where the agent was when the errors occurred"[^S1]（エラーが起きた地点のエージェントの状態から再開する）ことのできるシステムを作ります。

## 再開の背骨: 半分は簡単

簡単なほうの半分から始めましょう。再開の背骨は4つのステップです。ファイルを読む、`JSON.parse`する、`version`を確認する、フィールドを実行時のstateへ展開し直す。この4つが済めば、`runAgent`は初期の`messages`配列を組み立て直す必要がありません。チェックポイントがすでに完全なものを持っているので、初期化を飛ばして、そのままループに落ちていきます。

```javascript
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";

const CHECKPOINT_PATH = "./checkpoint.json";
const CHECKPOINT_VERSION = 1;
const MAX_TURNS = 40;

function saveCheckpoint(state) {
  const tmpPath = `${CHECKPOINT_PATH}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  renameSync(tmpPath, CHECKPOINT_PATH); // .tmp + rename: 書き込みをしくじっても、最後に使えるチェックポイントを壊せない
}

function loadCheckpoint() {
  if (!existsSync(CHECKPOINT_PATH)) return null;
  const raw = JSON.parse(readFileSync(CHECKPOINT_PATH, "utf8"));
  if (raw.version !== CHECKPOINT_VERSION) {
    throw new Error(`Checkpoint version mismatch: file is v${raw.version}, code is v${CHECKPOINT_VERSION}`);
  }
  return raw; // { version, task, turns, tokensUsed, messages, pendingToolUse }
}
```

この2つの関数が揃えば、`runAgent`の冒頭はシンプルな分岐になります。

```javascript
async function runAgent(task) {
  const cp = loadCheckpoint();

  let state;
  if (cp) {
    // 再開: stateはチェックポイントから来る。pendingToolUseはこのあと扱う
    state = cp.pendingToolUse ? await reconcile(cp) : cp;
  } else {
    // 新規開始: 最初のユーザーメッセージを自分で書き、残りはゼロで埋める
    state = {
      version: CHECKPOINT_VERSION,
      task,
      turns: 0,
      tokensUsed: 0,
      messages: [{ role: "user", content: task }],
      pendingToolUse: null,
    };
  }

  while (state.turns < MAX_TURNS) {
    state.turns++;
    const response = await client.messages.create({ messages: state.messages });
    state.tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
    state.messages.push({ role: "assistant", content: response.content });

    const toolUseBlock = response.content.find((b) => b.type === "tool_use");
    state.pendingToolUse = toolUseBlock
      ? { id: toolUseBlock.id, name: toolUseBlock.name, input: toolUseBlock.input }
      : null;
    saveCheckpoint(state); // 保存地点A: モデルの応答の後

    if (response.stop_reason !== "tool_use") break;

    const output = await executeTool(toolUseBlock.name, toolUseBlock.input);
    state.messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: toolUseBlock.id, content: output }],
    });
    state.pendingToolUse = null;
    saveCheckpoint(state); // 保存地点B: ツール結果が記録された後
  }

  return state;
}
```

再開後、ループが最初にやることは、いつもとまったく同じです。`state.messages`を取って、次の`client.messages.create()`を撃つ。モデルが見る`messages`は、クラッシュ前に見ていたものと同一であり、その間にプロセスの再起動があったことをモデルは知りようがありません。レッスン2が`messages`を手を加えずにチェックポイントへ入れることにこだわったのは、このためです。その配列さえ忠実に復元されていれば、再開はモデルから見えません。

## 難しい半分: 宙ぶらりんの呼び出しを突き合わせる

本当に厄介なのは、`state.pendingToolUse`が`null`でないチェックポイントです。2つの保存地点の位置を思い出してください。地点Aはモデルの応答の後にあり、その瞬間`pendingToolUse`はこの応答の`{id, name, input}`を持っています。地点Bはツール結果が記録された後にあり、`pendingToolUse`は`null`へ戻されています。プロセスがAとBのちょうど間で死ぬと——ツールがまだ実行されていないか、完了したのに結果が`messages`に入らなかったか——チェックポイントが保持するのは、`null`でない`pendingToolUse`です。

このとき`messages`の末尾は、`tool_use`ブロックを載せた`assistant`メッセージであり、対応する`tool_result`がありません。これは引きずったまま進める状態ではありません。プロトコルはこう要求しています。"return one tool_result for each tool_use block, all together in the next user message"[^S4]（各tool_useブロックにつき1つのtool_resultを返し、それらをまとめて次のユーザーメッセージに入れること）。その結果が1つ欠けているだけで、再開は次の呼び出しをそもそも行えません。モデルから見えるのは、自分がツール呼び出しを起こしたのに答えが永遠に返ってこない、中途半端なやり取りです。この宙ぶらりんの呼び出しは、ループに再突入する前に片づけなければなりません。

## 3つの対処法、成り立つのは1つだけ

この宙ぶらりんの`assistant`メッセージを前にすると、思いつく手は3つありますが、実際に成り立つのは1つだけです。

**手その1: `messages`から`assistant`メッセージを削除し、なかったことにする。** いちばんきれいに見えます。再開後の会話にはもう欠けがありません。しかし代償は2層に及びます。第一に、モデルは自分がすでに下した判断を忘れるので、同じ探索をもう一度たどり、余分なターンを無駄に燃やしかねません。第二に、そしてより危険なことに、そのツール呼び出しが実際にはすでに実行されていて、プロセスが結果を記録する前に死んだだけだった場合、メッセージを削除してもすでに起きた副作用は取り消されません。モデルも、以降のあらゆるログも、それが起きたことを知らなくなるだけです。削除が隠すのは事実であって、リスクではありません。

**手その2: ツールを再実行して、その結果を`tool_result`に埋める。** 読み取り専用のツール（`read_file`、`grep`など）にはこれがまさに正解です。2回読むことは1回読むことと変わらず、副作用はゼロです。影響の大きいツール（メール送信、データベースへの書き込み）には危険です。そのツールはすでに一度実行されている可能性が高く、無条件に再実行することは二度目の実行を意味します。これはまさにレッスン4が本格的に取り上げる冪等性の問題です。ここでは、いま行動に移せるルールを1つ立てておきます。**読み取り専用ツールはそのまま再実行する。影響の大きいツールは、再実行するかどうかを決める前に、まずすでに実行済みかどうかを確認しなければならない。**

**手その3: 「実行状況が不明です、状況を評価し直してください」と伝える`is_error: true`の`tool_result`を追加し、判断をモデルに返す。** これは実行されたかどうかを判別できないときの保守的なフォールバックです。`is_error`フィールドはまさに "Set to true if the tool execution resulted in an error"[^S4]（ツール実行がエラーになった場合にtrueを設定する）ために存在します。そして "letting the agent know when a tool is failing and letting it adapt works surprisingly well"[^S1]（ツールが失敗していることをエージェントに知らせ、適応させることは驚くほどうまく機能する）ことが分かっています。モデルはコンテキストを読み直し、黙って繰り返されたかもしれない行動に焼かれる代わりに、別の方法で結果を確認するかどうかを自分で決めます。

3つを並べると、手その1は脱落します。手その2と手その3は、それぞれ「判別できる」場合と「判別できない」場合をカバーしており、両方そろってはじめて完全な突き合わせルールになります。

```agentmentor-check
{
  "id": "sp-zh-03-dangling-tool-use",
  "label": "宙ぶらりんの呼び出しの扱い方",
  "prompt": "再開時、チェックポイントのpendingToolUseがnullでないことに気づきました。最後のassistantメッセージにtool_useが入っているのに、対応するtool_resultがありません。ある人が、いちばんきれいな手はそのassistantメッセージをmessagesから削除してなかったことにすることだ、そうすれば再開後の会話に欠けがなくなる、と主張しています。これは正しいでしょうか?",
  "whyHere": "3つの手を並べた直後——削除が最も誘惑的な手です——に置いています。宙ぶらりんのassistantメッセージを消すことがなぜ安全な選択肢ではないのかが見えているかを確かめます。",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "正しくない。削除はモデルにすでに下した判断を忘れさせ、実際に起きた副作用を隠しうる。正しい手はtool_useを消すことではなく、ツールの性質に応じて突き合わせ、対応するtool_resultを供給すること",
      "correct": true,
      "feedback": "正しい。削除は2層でコストを払います。モデルはすでにやったことを再探索しかねませんし、より危険なことに、そのツールが実際にはすでに実行されていた場合、削除はその事実を会話からも以降のあらゆる判断からも消し去るだけです。プロトコルはすべてのtool_useに対応するtool_resultを要求しており、削除ではなく突き合わせることが、続行可能な状態に戻る道です。"
    },
    {
      "id": "b",
      "text": "正しい。messagesが対応する結果を欠いたtool_useを持たなくなれば、再開後の会話はきれいであり、そこから安全に続行できる",
      "correct": false,
      "feedback": "「欠けがない」のは表面だけの清潔さです。そのツール呼び出しが実際にはすでに実行されていた場合（たとえばメールがもう出ていた場合）、メッセージを削除しても起きたことは取り消されません。モデルとログがそれを知らなくなるだけです。リスクは取り除かれたのではなく、覆い隠されています。"
    },
    {
      "id": "c",
      "text": "正しい。読み取り専用ツールも影響の大きいツールも、結局は最後にもう一度モデルに問い合わせることになるので、古くなったtool_useを落としても実質的な影響はない",
      "correct": false,
      "feedback": "2種類のツールは同じようには扱いません。読み取り専用ツールはそのまま再実行して本物の結果を取りに行くべきですし、すでに実行済みかを判別できない影響の大きいツールはis_errorへフォールバックすべきです。どちらの経路も、宙ぶらりんのtool_useに対応するtool_resultを供給して終わります。どちらもそれを削除しませんし、どちらも一律にモデルへ問い直すだけで済ませもしません。"
    }
  ]
}
```

## reconcile(cp): 突き合わせをコードにする

このルールを関数にします。ツール名から読み取り専用かどうかを判定し、そうであれば再実行する。そうでなければ「副作用台帳」を見に行き、この呼び出しがすでに実行されたかを確認する——本レッスンにはまだ副作用台帳がないので、コメントで代役を立てておき、実装はレッスン4で与えます。判別できないときは、`is_error`のフォールバックに落とします。

```javascript
const READ_ONLY_TOOLS = new Set(["read_file", "grep", "list_dir", "web_search"]);

async function reconcile(cp) {
  const { pendingToolUse, messages } = cp;
  const { id, name, input } = pendingToolUse;

  let toolResult;
  if (READ_ONLY_TOOLS.has(name)) {
    // 読み取り専用ツール: 副作用ゼロ。そのまま再実行して本物の結果を取る
    const output = await executeTool(name, input);
    toolResult = { type: "tool_result", tool_use_id: id, content: output };
  } else {
    // 影響の大きいツール: まず副作用台帳を確認して、すでに実行されたかを見る（台帳はレッスン4で導入。ここでは代役）
    // const record = await ledger.checkExecuted(id);
    // if (record) toolResult = { type: "tool_result", tool_use_id: id, content: record.result };
    // else toolResult = { type: "tool_result", tool_use_id: id, content: await executeTool(name, input) };
    //
    // 本レッスンでは台帳を繋いでいない。判別できないときは保守的なフォールバックを使う:
    toolResult = {
      type: "tool_result",
      tool_use_id: id,
      content: "Execution status unknown: the process crashed before this call finished, so there's no way to confirm whether it took effect. Please reassess the current situation.",
      is_error: true,
    };
  }

  messages.push({ role: "user", content: [toolResult] });
  cp.pendingToolUse = null;
  return cp;
}
```

`reconcile()`が終わると、`cp.messages`の末尾には対応する`tool_result`が埋まり、`cp.pendingToolUse`は`null`に戻っています。この`cp`はもはや、保存地点Bで正常に着地したチェックポイントと見分けがつきません。そのまま`while`ループへ渡して続行できます。

## 再開後: turnsとtokensUsedの数え方

再開パスが狂わせやすいカウンタが2つあり、それぞれ独立して明示しておく価値があります。

`turns`は再開でリセットされません。これは「このプロセスインスタンスが何ターン走ったか」ではなく、タスク開始から現在までの総ターン数を数えるものです。チェックポイントの`turns`は中断した地点から加算を続けるべきであり、それだけがレッスン2で設けた`MAX_TURNS`の上限を機能させ続ける唯一の道です。再開時に`turns`をゼロにすると、クラッシュと復旧を繰り返すタスクはターンの天井をすり抜け、永遠に走り続けられてしまいます。

`tokensUsed`も同じです。再計算するのではなく、チェックポイントから引き継ぎます。"Context Engineering: Spending Finite Attention Where It Counts" がコンテキストの圧縮を扱うとき、`tokensUsed`は「現在のウィンドウの使用量」を意味しますが、チェックポイントが保存したのはまさにクラッシュの瞬間のそのウィンドウの使用量です。両者は同じ意味を担っているので、再開時はそれを受け取ってそのまま続ければよく、余分な変換は要りません。

<!-- exercises -->
## 💻 演習

### レベル1: 3つのチェックポイント、3つの再開アクション

以下は再開時に読み込まれた3つのチェックポイントです（読みやすさのため`messages`の中身は省略しています）。それぞれについて、再開時に`runAgent`が何をすべきか、そしてその理由を書いてください。

```javascript
// チェックポイントA
const cpA = {
  version: 1,
  task: "今週のミーティングノートをまとめるのを手伝って",
  turns: 6,
  tokensUsed: 18420,
  messages: [/* … 最後はプレーンテキストのassistant応答 … */],
  pendingToolUse: null,
};

// チェックポイントB
const cpB = {
  version: 1,
  task: "今週のミーティングノートをまとめるのを手伝って",
  turns: 7,
  tokensUsed: 19310,
  messages: [/* … 最後はtool_useを含むassistantメッセージ … */],
  pendingToolUse: { id: "toolu_01A", name: "read_file", input: { path: "./notes/meeting-08-25.md" } },
};

// チェックポイントC
const cpC = {
  version: 1,
  task: "結論をチームにメールで知らせて",
  turns: 9,
  tokensUsed: 24003,
  messages: [/* … 最後はtool_useを含むassistantメッセージ … */],
  pendingToolUse: { id: "toolu_01B", name: "send_email", input: { to: "team@example.com", subject: "今週の結論" } },
};
```

<!-- rubric -->
- cpA: `pendingToolUse`が`null`であり、クラッシュは保存地点Bの後、次の`create()`の前に落ちたことを意味する。再開時は`messages`を取って次の呼び出しを撃つだけでよく、突き合わせは不要
- cpB: `pendingToolUse`が`read_file`を指しており、副作用ゼロの読み取り専用ツールである。再開時はそのまま再実行して結果を取り、`tool_result`を埋めて続行する
- cpC: `pendingToolUse`が`send_email`を指しており、無条件には再実行できない影響の大きいツールである。本レッスンにはまだ副作用台帳がないので、メールを再送するのではなく`is_error`へフォールバックし、モデルに事実（実行状況が不明であること）を伝える

<!-- hint -->
1. まず`pendingToolUse`が`null`かどうかを確認してください。`null`ならそもそも突き合わせは関わらず、問題は実質的に残る2つについてのものになります。2. 次にツール名を見ます。`READ_ONLY_TOOLS`に入っているでしょうか? 3. 再実行ではなくフォールバックを要するのは、「すでに実行済みか?」を判別できない影響の大きいツールだけです。

<!-- answer -->
cpAには突き合わせが要りません。`pendingToolUse`が`null`であることは、クラッシュが保存地点Bの後に落ちたこと、`messages`が完全であることを意味し、再開時はそれを使って次の`client.messages.create()`を直接撃ちます。cpBは再実行が必要です。`read_file`は読み取り専用ツールで、繰り返しても副作用が生じないため、再開時に`reconcile()`を呼べば自然と`READ_ONLY_TOOLS`の分岐に落ち、本物のファイル内容を取得して`tool_result`に埋めます。cpCは再実行できません。`send_email`は影響の大きいツールで、すでに一度実行されている可能性が高く、無条件に再実行すればチームに重複したメールが届きます。本レッスンには実行済みかを確認する影響台帳がまだないので、`reconcile()`は`is_error`のフォールバック分岐に落ち、再送する代わりに「実行状況が不明なので評価し直してほしい」という正直な内容をモデルに手渡すべきです。

### レベル2: 重複メールの根本原因を突き止める

運用インシデントの報告です。「`send_email`ツール呼び出しの後、結果が記録される前に、プロセスがOOM killerに落とされて再起動された。再起動時にハーネスが自動で`--resume`し、数分後にユーザーから同一のメールを2通受け取ったと報告があった。」

当時本番で動いていた`reconcile()`はこうでした。

```javascript
// インシデント発生時に本番で動いていた版
async function reconcile(cp) {
  const { pendingToolUse, messages } = cp;
  const { id, name, input } = pendingToolUse;

  const output = await executeTool(name, input);
  messages.push({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: id, content: output }],
  });
  cp.pendingToolUse = null;
  return cp;
}
```

根本原因を特定し、そのうえでこの`reconcile()`を、ツールの性質で振り分ける版に書き直してください（ヒント: 本レッスンが立てたルールは「読み取り専用はそのまま再実行、台帳のない影響の大きいツールは`is_error`へフォールバック」です）。書き直したら`node`で走らせ、`send_email`のような影響の大きいツールがもう`executeTool()`を起動しないことを確認してください。

<!-- rubric -->
- 根本原因: `reconcile()`が読み取り専用ツールと影響の大きいツールを区別せず、あらゆる`pendingToolUse`に対して`executeTool()`を呼んで再実行している。`send_email`はクラッシュ前にすでに一度実行されていた可能性が高く、無条件の再実行はそれを二度目に走らせ、メールを2通送ってしまう
- 修正: `READ_ONLY_TOOLS`の集合を持ち込んでツール名で振り分ける。`executeTool()`を呼んで再実行できるのは読み取り専用ツールだけとし、影響の大きいツール（`send_email`など）は無条件に再実行せず、`is_error: true`の`tool_result`を与えて「実行状況が不明」という判断をモデルに返す
- 書き直したコードでは、`read_file`のような呼び出しと`send_email`のような呼び出しが2つの異なる経路をたどらなければならないが、どちらの経路も最後に`messages`へ対応する`tool_result`を供給して終わらなければならない。そうでなければ再開は会話を正常に続けられない

<!-- answer -->
根本原因は、`reconcile()`がツールを副作用で区別せず、あらゆる`pendingToolUse`を「再実行して安全」として扱っていることです。`send_email`はクラッシュ前にすでにメールを送信していた可能性が高く、プロセスはただその結果を`messages`に記録するところまで至らなかっただけです。再開時にもう一度`executeTool("send_email", …)`を呼べば、同じメールが本当に二度目に送られます。修正版はツール名で振り分けなければなりません。

```javascript
const READ_ONLY_TOOLS = new Set(["read_file", "grep", "list_dir", "web_search"]);

async function reconcile(cp) {
  const { pendingToolUse, messages } = cp;
  const { id, name, input } = pendingToolUse;

  let toolResult;
  if (READ_ONLY_TOOLS.has(name)) {
    const output = await executeTool(name, input);
    toolResult = { type: "tool_result", tool_use_id: id, content: output };
  } else {
    toolResult = {
      type: "tool_result",
      tool_use_id: id,
      content: "Execution status unknown: the process crashed before this call finished, so there's no way to confirm whether it took effect. Please reassess the current situation.",
      is_error: true,
    };
  }

  messages.push({ role: "user", content: [toolResult] });
  cp.pendingToolUse = null;
  return cp;
}
```

修正後、`READ_ONLY_TOOLS`に入っていない`send_email`のようなツールは二度と`executeTool()`を起動しません。`reconcile()`はそれに`is_error`の`tool_result`を供給するだけです。実際に再実行されるのは`read_file`のような読み取り専用ツールだけです。`node`で走らせ、読み取り専用のツール名で`reconcile()`を1回、`send_email`で1回呼んで、`executeTool`の呼び出しログを確認してください。読み取り専用の実行では現れ、`send_email`の実行では現れないはずです。
<!-- /exercises -->

## まとめ

再開の背骨は難しくありません。チェックポイントを読み、バージョンを確認し、フィールドを実行時のstateへ展開し直し、初期化を飛ばしてそのままループへ落ちる——その間にクラッシュがあったことをモデルは感じ取ることすらできません。実際に設計を要するのは、宙ぶらりんの呼び出しの突き合わせです。削除は判断を失わせ、すでに起きた副作用を覆い隠します。読み取り専用ツールなら気兼ねなく再実行できます。そして実行済みかを判別できない影響の大きいツールには、闇雲な再実行よりも`is_error`のフォールバックのほうが安全な選択です。しかしこのルールは、まだ1つの問題を解いていません。影響の大きいツールがすでに実行されたかどうかを、実際にはどうやって確認するのか? 本レッスンは「判別できない」にフォールバックしただけでした。本当に判別できるようになるには影響台帳が要ります——そしてそれこそが、次のレッスンが解く問題です。

[>> レッスン4: 副作用と冪等性: 再開時に再実行しても安全なツールはどれか](./04-side-effects-idempotency.md)
