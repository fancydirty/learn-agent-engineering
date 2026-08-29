# レッスン2: チェックポイント: 実行中の場面をディスクに書き出す

> 学習目標:
> - checkpoint.jsonに入るべき6つのフィールドを挙げ、それぞれが欠けたときに再開が何にぶつかるかを言う
> - ループの1ターンの中にある2つの保存地点（モデルがツールを指名した直後、ツール結果が記録された直後）を区別し、片方しか書かないと何を招くかを説明する
> - チェックポイントファイル自体を壊しえない`saveCheckpoint`を書く — その場で上書きするのではなく、一時ファイルを書いてからアトミックにリネームする
>
> 前提: レッスン1を読み、メモリと実行状態を区別できること。"Agent Harness Fundamentals: Loops and Control" の`messages`配列と`stop_reason`駆動のループ骨格に慣れていること | 前: [レッスン1 <<](./01-memory-vs-state.md) | 次: [レッスン3 >>](./03-resume-from-checkpoint.md)

## 実行中の場面はデフォルトではメモリ上にある

レッスン1ではメモリと実行状態を切り分けました。メモリはモデルに与えるもの、実行状態はハーネス自身が抱えている実行中の場面——`messages`配列、ターンカウンタ、結果がまだ記録されていないツール呼び出し——です。デフォルトでは、その場面はプロセスのメモリ上にしか存在しません。プロセスが死ねば一緒に消え、ディスク上の他のファイルがすべて無傷であっても、タスクはゼロからやり直すことしかできません。

その場面をディスクに書き出し、再起動したプロセスが読み戻せるものに変えること——それが**チェックポイント**です。実務で長時間タスクの信頼性を実際に支えているのは、たいていの場合、あらゆる失敗をモデル自身に吸収させることではありません。"the adaptability of AI agents built on Claude with deterministic safeguards like retry logic and regular checkpoints"[^S1]（Claude上に構築されたAIエージェントの適応力を、リトライロジックや定期的なチェックポイントといった決定論的な安全装置と組み合わせること）です。本レッスンはそのチェックポイント側を扱います。何を入れるのか、ループのどこで書くのか、そして書き込みそのものをどう行うのか。間違ったやり方で書かれたチェックポイントは、チェックポイントが無い場合よりも状況を悪くしうるからです。

## 何を保存するか: checkpoint.jsonの6つのフィールド

チェックポイントは「メモリ上のものを全部ファイルに吐き出す」ことではありません。「ループの再開に必要なものを記録する——それ以上でも以下でもなく」です。本コースの以降のレッスンはすべて、同じプロトコルの上で動きます。

```javascript
const checkpoint = {
  version: 1,
  task: "前四半期のサポートチケットを問題種別ごとに整理し、1つの表にまとめる",
  turns: 3,
  tokensUsed: 14208,
  messages: [/* 会話履歴の全体 */],
  pendingToolUse: null, // または { id, name, input }
};
```

- **version**: プロトコルのバージョン番号です。このフォーマットはいずれ変わります（`messages`の圧縮、`pendingToolUse`の新しい形など）。`version`があることで、再開パスは何よりも先に「このチェックポイントを自分は認識できるか?」を問えます。知らないバージョンに対しては、歯を食いしばって解析を続けるのではなく、読み込みを拒否して大きな声で失敗すべきです。
- **task**: 元のユーザータスクを言葉で書いたものです。再起動後、ハーネスのコードは自分が何をしていたかを覚えていません。読めるのはディスク上のこのファイルだけです。`task`がなければ、ハーネスはそのチェックポイントがどのタスクのものかすら言えず、再開の進捗をユーザーに報告することなど到底できません。
- **turns**: すでに何ターン走ったかです。"Agent Harness Fundamentals: Loops and Control" の停止条件（たとえば最大ターン数の上限）を発動させるかどうかを決めるのはこの値であり、再開がゼロからではなくそこから数え続ける数字でもあります。
- **tokensUsed**: 累積のトークン消費量です。"Context Engineering: Spending Finite Attention Where It Counts" の圧縮しきい値はこの数字で発火します。これをチェックポイントから外すと、再開はカウントがゼロから始まるふりをして——圧縮の判断をことごとくずらしてしまうか——`messages`の全メッセージについて使用量を推定し直すはめになります。そして多くの構成では、過去の使用量の数字はもう手に入りません。
- **messages**: 会話の場面の全体、モデルが見てきたuser / assistant / tool_resultのすべてのメッセージです。チェックポイントの中で最大のものであり、唯一省けないものでもあります。モデルには自前の記憶がなく、それ以前に何が起きたかについてモデルが知っていることのすべては、次のリクエストであなたが手渡すこの配列です。これを落とせば、再開されるのは「続き」ではありません。旧実行がすでに生み出した副作用をすべて引きずったまま、ゼロから始まるまったく新しいタスクです。
- **pendingToolUse**: `null`か、`{ id, name, input }`の形をしたレコードです。モデルが指名した、結果がまだ記録されていないツールを指します。このフィールドをどう使うかはレッスン3の担当で、そこで再開が突き合わせを行います。ここでは、これが中途半端な状態を印づけるためにチェックポイントが用意した専用の枠だと分かっていれば十分です。形をシンプルに保つため、本レッスンの例はすべて1ターンにつき`tool_use`ブロックは1つと仮定します。1ターンで複数のツール呼び出しを並行して出す場合は配列にしてください。考え方は同じです。

## いつ保存するか: 1ターンに2つの保存地点

これらのフィールドをループに流し込むと、タイミングは「毎ターンの最後に1回書く」ほど単純ではないことが分かります。保存地点は2つあります。

```javascript
while (response.stop_reason === "tool_use") {
  state.messages.push({ role: "assistant", content: response.content });

  const block = response.content.find((b) => b.type === "tool_use");

  // 保存地点A: モデルがツールを指名した。まだ実行されていない
  state.pendingToolUse = { id: block.id, name: block.name, input: block.input };
  saveCheckpoint(state);

  const result = await executeTool(block.name, block.input);

  state.messages.push({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
  });
  state.turns += 1;
  state.pendingToolUse = null;

  // 保存地点B: このターンのツール結果はmessagesに完全に記録された
  saveCheckpoint(state);

  response = await callModel({ tools, messages: state.messages });
  state.tokensUsed += response.usage?.output_tokens ?? 0;
}
```

**地点A**はモデルの応答が届いた後、ツールが走る前に置きます。応答の`tool_use`ブロックを`pendingToolUse`に記録してから書きます。**地点B**はツール結果が`messages`に追加された後に置きます。`pendingToolUse`を`null`に戻してから、もう一度書きます。

Bだけで十分でしょうか。露出しているのはAとBの間の窓です。モデルがツールを指名し、ツールが実行中であるか、完了はしたもののその結果が`messages`に入っておらず、ディスクにも書かれていない、という窓です。この窓でプロセスが死ぬと、ディスク上の最後のチェックポイントは前のターンでBが書いたものであり、このターンの呼び出しについて何も知りません。細部が少し失われたのではなく、このツール呼び出しがディスク上に痕跡を一切残していない、ということです。レッスン3は再開時に突き合わせを行います——そのツールは本当に完了したのか、再実行が必要か——そしてその突き合わせの相手こそが、Aが書いた`pendingToolUse`です。本レッスンは穴を掘るところまでです。レッスン6の演習では、Bだけのチェックポイントを目の前に置き、再開で何が壊れるかを診断してもらいます。

## どう保存するか: その場で上書きしてはいけない

真っ先に思いつくやり方は、`state`オブジェクトを`JSON.stringify`して、`fs.writeFileSync`で古い`checkpoint.json`にそのまま上書きすることです。プロセスが正常終了する場合はそれで問題ありません。しかし「正常終了」こそ、チェックポイントが用意されていない場合です。チェックポイントは、プロセスがいつ落とされるか分からないこと、電源が落ちること、コンテナが追い出されることのために存在します。ファイルの書き込みはアトミックな操作ではありません。書き込みの途中でプロセスが中断されると、ディスク上に残る`checkpoint.json`は書きかけかもしれません。古いバージョンでもなく、新しいバージョンでもなく、ただ途中で切れたJSONです。次の再開は`JSON.parse`で例外を投げますし、そのファイルはタスクにとって場面の唯一のコピーでした。戻れる古いバージョンは存在しません。

取るべき手は「一時ファイルを書いてから、アトミックにリネームする」です。完全な内容を`checkpoint.json.tmp`に書き込みます。その途中でクラッシュしても、犠牲になるのは一時ファイルだけで、本物の`checkpoint.json`はクラッシュ前の無傷な古いバージョンのままであり、再開は問題なく読めます。`.tmp`ファイルが完成したら、`fs.renameSync`で本物のファイル名に付け替えます。同一ファイルシステム上では、`rename`は一段階のアトミックな置換です。OSはディレクトリエントリを新しいファイルに丸ごと向けるか、古いファイルに向けたままにするかのどちらかであり、途中まで名前が変わった状態というものは存在しません。

```javascript
import fs from "node:fs";
import path from "node:path";

function saveCheckpoint(state, dir = "./checkpoints") {
  fs.mkdirSync(dir, { recursive: true });

  const finalPath = path.join(dir, "checkpoint.json");
  const tmpPath = `${finalPath}.tmp`;

  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  fs.renameSync(tmpPath, finalPath); // 同一ファイルシステム上では、renameはアトミックな置換
}
```

```agentmentor-check
{
  "id": "sp-zh-02-direct-overwrite-risk",
  "label": "チェックポイントファイルをその場で上書きすると何が壊れるかの判断",
  "prompt": "あなたはsaveCheckpointをこう書こうとしています。stateオブジェクトをJSON.stringifyし、fs.writeFileSyncで同じcheckpoint.jsonにそのまま上書きする。これの何が問題でしょうか?",
  "whyHere": ".tmpを書いてからリネームするという手順を示した直後に置いています。tmpとrenameを使えという結論を丸暗記しただけなのか、その場での上書きがなぜ安全でないのかを本当に理解しているのかを確かめるためです。",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "問題ない。checkpoint.jsonはそもそも最新のスナップショットだけを持てばよいのだから、その場で上書きするのは古い内容を新しい内容に差し替えているだけであり、余分なファイルも余分な手順も要らない",
      "correct": false,
      "feedback": "ファイルが最新のスナップショットだけを持つべきかという話と、新しい内容をどうやってそのファイルに入れるかという話は、別の問題です。チェックポイントは確かに現在のコピーが1つあれば足ります。しかし上書きそれ自体がアトミックではありません。クラッシュは書き込みを中断しえますし、その瞬間ディスク上にあるのは完全な古いバージョンでも完全な新しいバージョンでもなく、部分的に書かれたファイルです。"
    },
    {
      "id": "b",
      "text": "問題がある。書き込みの途中でプロセスが落とされると、checkpoint.jsonが書きかけのまま残りうる。JSON.parseが読めない途中で切れた内容であり、しかもそれはタスクにとって場面の唯一のコピーで、他に復旧できる場所がない",
      "correct": true,
      "feedback": "正しい。ファイルの書き込みは単一のアトミックな手順ではなく、プロセスはいつ落とされるか分からず、中断された書き込みは場面の唯一のコピーを半分のJSONドキュメントに変えてしまいます。まず一時ファイルを書き、それが完成してはじめて本物のファイル名にリネームしてください。そうすればディスク上の`checkpoint.json`は、どの瞬間においても完全な古いバージョンか完全な新しいバージョンのどちらかであり、その中間のものにはなりません。"
    },
    {
      "id": "c",
      "text": "問題があるが、その問題はディスク使用量である。同じファイルに何度も書き重ねるとcheckpoint.jsonは保存のたびに膨らんでいくので、長時間タスクは本来必要な容量よりはるかに多くを食い潰すことになる",
      "correct": false,
      "feedback": "上書きしてもファイルは膨らみません。各書き込みは古い内容を置き換えるので、サイズは保存回数ではなく現在のstateの中身の量におおむね比例します。本当のリスクはディスク容量ではなく、書き込みそのものがクラッシュで途中で切られ、完全でもパース可能でもないファイルが残ることです。"
    }
  ]
}
```

## プロダクトの参照点: Claude Codeにおけるチェックポイント

本レッスンが教えるプロトコルは無人の長時間タスク向けで、粒度はループ1ターンにつき2つの保存地点です。対比として、実在のプロダクト——Claude Code——が「チェックポイント」という語をどこに置いているかを見てみましょう。"checkpointing automatically captures the state of your code before each user prompt."[^S2]（チェックポイント機能は、ユーザープロンプトのたびにコードの状態を自動的に捕捉する）。そして "Every user prompt creates a new checkpoint"[^S2]（ユーザープロンプトのたびに新しいチェックポイントが作られる）であり、"Claude Code saves checkpoints with the conversation, so you can still run /rewind after you resume a session"[^S2]（Claude Codeはチェックポイントを会話とともに保存するため、セッションを再開したあとでも/rewindを実行できる）です。

それが仕えている場面は、ここでの場面とは違います。Claude Codeのチェックポイントは人間がループに入っているセッションのために作られています。ユーザーはいつでも手を止め、あるやり方を試し、どこかのメッセージより前に戻ってもう一度やり直そうと決めることができる——だから自然な単位は「ユーザーが何かを言った」になります。あなたがここで作っているものは無人の長時間タスク向けです。止めてくれる人は誰も控えておらず、単位は「ループが1周した」であり、1ターンの中でさらに保存地点AとBに分かれます。クラッシュは「モデルがツールを指名した」と「結果が記録された」の間に落ちうるからです。この2つは同じ問題を解いているのではありません。並べて置いたのは、主に1つのことをはっきりさせるためです。チェックポイントをどれだけ細かく刻むか、どれだけ頻繁に書くかは、そのチェックポイントが何に仕えているかで決まります。唯一の答えがあるわけではありません。

## チェックポイントはタダではない

チェックポイントにはコストがかかります。本レッスンのプロトコルでは、ループ1ターンにつきディスクへの書き込みが2回発生します。3ターンや5ターンで終わる短いタスクにとって、それは純粋なオーバーヘッドです。プロセスは最後まで走り切り、それらのチェックポイントファイルは一度も読まれません。この仕組みを自分のハーネスに入れるかどうかは、"you should consider adding complexity only when it demonstrably improves outcomes."[^S3]（複雑さを加えるのは、それが結果を明確に改善すると示せるときだけにすべきである）という原則に照らして測る価値があります。タスクが長く、クラッシュのコストが高いほど、この取引は割に合うようになります。数秒で終わるものなら、おそらく必要ありません。

## 💻 演習

<!-- exercises -->

### レベル1: 不完全なチェックポイントを埋める

ある人が`saveCheckpoint`をこう書きました。

```javascript
function saveCheckpoint(state) {
  fs.writeFileSync("checkpoint.json", JSON.stringify({ messages: state.messages }));
}
```

本レッスンが定めたプロトコルに照らして、このチェックポイントにはまだどのフィールドが欠けていますか? 欠けているフィールドそれぞれについて、この不完全なチェックポイントから再開しようとしたとき、正確にどこで破綻するかを具体的に述べてください。

<!-- rubric -->
- 欠けている5つのフィールドをすべて挙げている: `version`、`task`、`turns`、`tokensUsed`、`pendingToolUse`
- `version`について: 再開パスがファイルのプロトコルバージョンを判定するすべを持たず、フォーマットが変わったあとに読み込みを拒否すべきかを決められないと説明している
- `task`について: ハーネスがこの場面がどの元タスクに属するのかを知らず、どのタスクを再開しているのかをユーザーに報告できないと説明している
- `turns`について: 再開後にターン数がゼロから数え直しになり、実際に走ったターン数と一致しなくなるため、最大ターン数の停止条件が早すぎるタイミングで発火するか、まったく発火しなくなると説明している
- `tokensUsed`について: 圧縮しきい値が拠り所にできる正確な累計を失うため、再開はまだしきい値に達していないと誤判断するか、使用量を推定し直すはめになる（そして推定はたいてい過去の使用量の数字に手が届かない）と説明している
- `pendingToolUse`について: モデルがツールを指名したものの実行が完了していない窓でクラッシュが起きていた場合、再開はツール呼び出しが宙ぶらりんになっていることをまったく知りようがなく、レッスン3で扱う突き合わせができないと説明している

<!-- answer -->
このチェックポイントは`messages`だけを残しており、他の5つのフィールドが欠けています。

1. **`version`**: これがないと、再開パスはそのファイルのフォーマットを自分が認識できるかを確認できません。プロトコルが変わると（たとえばあるフィールドの形が新しくなると）、再開コードは「これは自分が扱えるチェックポイントのバージョンか?」を判断する拠り所を失います。歯を食いしばって解析するしかなく、それが失敗しても何が噛み合わなかったのかを言えません。
2. **`task`**: これがないと、再起動したハーネスが読むのは`messages`の山だけで、それらのメッセージが何を成し遂げるために連なっているのかを述べるすべがありません。再開時にユーザーへ進捗を報告できませんし、複数タスクを扱う構成では、自分がいま拾い上げたのがどのタスクなのかを確認できません。
3. **`turns`**: これがないと、再開はゼロから数え始めるしかありません。「Nターンで停止」のような停止条件を設けていた場合、再開後のカウントは実際に起きたターン数と一致しなくなるため、条件は早く発火するか、あるいは何の意味も持たなくなります。
4. **`tokensUsed`**: これがないと、圧縮しきい値は参照できる累計を失います。再開はカウントがゼロから始まるふりをして「このターンは圧縮すべきか?」の判断をまるごとずらしてしまうか、`messages`の過去メッセージ全体にわたって使用量を推定し直そうとします。そして多くの構成では、その過去の`usage`の数字はもう取り戻せません。
5. **`pendingToolUse`**: これがないと、直前のクラッシュがモデルはすでにツールを指名したが実行が完了していない、あるいは結果が記録されていない窓に落ちていた場合、このチェックポイントにはその記録が何も残りません。再開はツール呼び出しが本当に宙ぶらりんになっていたのかを判別できず、レッスン3で扱う「この呼び出しは再実行が必要か?」の突き合わせもできません。何も起きなかったかのように振る舞うことしかできないのです。

<!-- hint -->
「何を保存するか」の節に戻り、チェックポイントオブジェクトの6つのフィールドを1つずつ辿って、この切り詰められた版に現れていないのはどれかを確かめてください。

<!-- hint -->
「Xが欠けている」で止めないでください。もう一歩踏み込みます。ハーネスのコードが本当にこのファイルから`state`を組み立て直してループに再突入したら、最初にぶつかるのは何でしょうか?

<!-- rubric -->

### レベル2: 潜在する2つの障害を直す

同僚が、ツールを2回続けて呼ぶタスクを実行するために、以下の`runAgent`を書きました。普段は問題なく見えますが、実行の途中でプロセスが落とされた瞬間、復旧できる場面は開けないか、辻褄が合わないかのどちらかになります。クラッシュで崩れる2箇所を見つけ、それぞれが何を招くかを述べ、修正してください。修正後のコードは実際に動くものでなければなりません。

```javascript
import fs from "node:fs";

function saveCheckpoint(state) {
  fs.writeFileSync("checkpoint.json", JSON.stringify(state, null, 2));
}

async function runAgent(task, tools, callModel, executeTool) {
  const state = {
    version: 1,
    task,
    turns: 0,
    tokensUsed: 0,
    messages: [{ role: "user", content: task }],
    pendingToolUse: null,
  };

  let response = await callModel({ tools, messages: state.messages });

  while (response.stop_reason === "tool_use") {
    state.messages.push({ role: "assistant", content: response.content });

    const block = response.content.find((b) => b.type === "tool_use");
    const result = await executeTool(block.name, block.input);

    state.messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
    });
    state.turns += 1;

    saveCheckpoint(state);
    response = await callModel({ tools, messages: state.messages });
  }

  return state;
}
```

<!-- rubric -->
- 1つ目の障害を特定している: `saveCheckpoint`が素の`fs.writeFileSync`で同じファイルを上書きしているため、中断された書き込みはパースできない半分のJSONドキュメントを残し、戻れる古いバージョンもない
- 2つ目の障害を特定している: ループ全体がツール結果の記録後（地点B）にしか書いておらず、モデルがツールを指名してからツールが完了するまでの間（地点A）に保存がないため、その窓でのクラッシュはツール呼び出しの痕跡をディスク上に一切残さない
- 修正1: `saveCheckpoint`を書き換えて、まず`.tmp`ファイルを書き、それから`fs.renameSync`でアトミックに置き換える
- 修正2: `block`を取り出した後、`executeTool`を呼ぶ前に、`pendingToolUse`への代入と`saveCheckpoint`（地点A）を追加し、地点Bで`pendingToolUse`を`null`に戻す
- 修正後のコードが構造的に完全で実行可能であること（例のフェイクな`callModel` / `executeTool`に対してだけでもよい）

<!-- answer -->
2つの障害があります。

1. **その場での上書きは安全ではない。** `saveCheckpoint`は`fs.writeFileSync`で古い`checkpoint.json`にそのまま書き重ねています。プロセスはいつ落とされるか分からず、書き込みが中断されれば、ディスクに残るのは完全な古いバージョンでも完全な新しいバージョンでもなく、`JSON.parse`が読めない途中で切れた内容です。しかもそのファイルは場面の唯一のコピーであり、他に復旧できる場所はありません。
2. **Bでしか保存せず、Aでは一度も保存していない。** ループは`saveCheckpoint`を、ツール結果が`messages`に追加されたあとに1回だけ呼んでいます。クラッシュが「モデルがツールを指名した」と「結果が記録された」の間——ツールが実行中、あるいは完了はしたが結果が`messages`に入る前——に落ちると、ディスク上の最後のチェックポイントは前のターンの古いstateのままで、このツール呼び出しについて何も知りません。

修正——アトミックな書き込みと、地点Aでの保存:

```javascript
import fs from "node:fs";
import path from "node:path";

function saveCheckpoint(state, dir = "./checkpoints") {
  fs.mkdirSync(dir, { recursive: true });
  const finalPath = path.join(dir, "checkpoint.json");
  const tmpPath = `${finalPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  fs.renameSync(tmpPath, finalPath); // 同一ファイルシステム上では、renameはアトミックな置換
}

async function runAgent(task, tools, callModel, executeTool, dir) {
  const state = {
    version: 1,
    task,
    turns: 0,
    tokensUsed: 0,
    messages: [{ role: "user", content: task }],
    pendingToolUse: null,
  };

  let response = await callModel({ tools, messages: state.messages });

  while (response.stop_reason === "tool_use") {
    state.messages.push({ role: "assistant", content: response.content });

    const block = response.content.find((b) => b.type === "tool_use");

    // 保存地点A: モデルがツールを指名した。まだ実行されていない
    state.pendingToolUse = { id: block.id, name: block.name, input: block.input };
    saveCheckpoint(state, dir);

    const result = await executeTool(block.name, block.input);

    state.messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
    });
    state.turns += 1;
    state.pendingToolUse = null;

    // 保存地点B: このターンのツール結果はmessagesに完全に記録された
    saveCheckpoint(state, dir);

    response = await callModel({ tools, messages: state.messages });
  }

  return state;
}
```

検証には、実物のモデルに一切触れないフェイクを2つ用意すれば十分です。2回続けてツール呼び出しを要求し、3回目の呼び出しではじめて`end_turn`を返す`fakeCallModel`と、固定の文字列を返す`fakeExecuteTool`です。走らせると、ディスク上の`checkpoint.json`が4回（2ターン × 保存地点AとB）書かれ、最後は`pendingToolUse`が`null`、`turns`が`2`で終わることが確認できます——メモリ上の最終stateとぴったり一致します。

<!-- hint -->
まず`saveCheckpoint`単体から始めてください。本レッスンの「どう保存するか」の節にある版と見比べて、どの手順が欠けているかを確かめます。

<!-- hint -->
次に、ループ本体に`saveCheckpoint(state)`が何回、どの行に現れるかを数えてください。そして自問します。モデルがツールを指名してから（`block`を取り出してから）、ツールが実際に完了する（`await executeTool`が返る）までの間に、ディスクに何か書かれているでしょうか?

<!-- /exercises -->

## まとめ

- 実行中の場面はデフォルトではメモリ上にあり、プロセスとともに死ぬ。チェックポイントの役目は、クラッシュのたびに長時間タスクをゼロから走り直させるのではなく、壊れた地点から拾い上げさせることにある[^S1]
- checkpoint.jsonは6つのフィールドを持つ: `version`、`task`、`turns`、`tokensUsed`、`messages`、`pendingToolUse`。`messages`が最大の塊であり、これがなければモデルは以前に何が起きたかを知る手がかりを一切持たない。`pendingToolUse`はレッスン3が突き合わせる、宙ぶらりんの呼び出しの印である
- ループの1ターンには2つの保存地点がある。モデルがツールを指名した後・ツールが走る前のA、ツール結果が`messages`に完全に記録された後のB。Bだけで保存すると、モデルが指名したツールがまだ完了していない窓に死角ができる
- チェックポイントファイルをその場で上書きするのは安全ではない。プロセスはいつ落とされるか分からず、書き込み途中のクラッシュは場面の唯一のコピーを半分のJSONドキュメントに変える。まず`.tmp`ファイルを書き、`fs.renameSync`で置き換えること——それが、どの瞬間にディスク上にあるものも1つの完全なバージョンであることを保証する
- Claude Codeのチェックポイントは異なる粒度で動く。ユーザープロンプトのたびに自動的に捕捉され[^S2]、人間がループに入っているセッションに仕えている。本レッスンが作るものは無人の長時間タスク向けだ。刻む地点は違うが、どちらも同じ問いに答えている: 何かがうまくいかなかったとき、どこへ戻るのか?
- チェックポイントはタダではない。1ターンにつき2回のディスク書き込みは短いタスクでは純粋なオーバーヘッドであり、加えるべきかどうかは、多ければよいという思い込みではなく、それが結果を明確に改善するかどうかで決まる[^S3]

[>> レッスン3: チェックポイントからの再開: ループを再起動する](./03-resume-from-checkpoint.md)
