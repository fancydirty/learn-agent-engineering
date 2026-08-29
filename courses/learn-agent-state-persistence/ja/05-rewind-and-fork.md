# レッスン5: 巻き戻しとフォーク: チェックポイントの第二の価値

> 学習目標:
> - 障害復旧を超えたチェックポイントの2つの能動的な使い道——以前の場面へ巻き戻してやり直す、第二のタイムラインをフォークして探索する——を説明し、どちらも再開とまったく同じチェックポイント列の上に成り立っていることを理解する
> - チェックポイントを「最新の1つだけ保持」からターンごとに保持される列へと変え、`rewindTo(turn)`を実装し、巻き戻すのは判断の場面であって、すでに起きた外部の副作用ではないことを説明する
> - `forkFrom(turn, branchName)`を実装して同じ場面から独立したタイムラインをコピーし、チェックポイント・Git・副作用台帳がそれぞれ何を担当するかの境界線を引く
>
> 前提: レッスン1〜4を終え、`checkpoint.json`のフィールド構成（`version`、`task`、`turns`、`tokensUsed`、`messages`、`pendingToolUse`）とアトミックな書き込み、再開が宙ぶらりんな呼び出しをどう調整するか、そしてレッスン4の副作用台帳と冪等キーを知っていること | 前: [レッスン4 <<](./04-side-effects-idempotency.md) | 次: [レッスン6 >>](./06-build-checkpointing.md)

## チェックポイントはヒューズだけではない

最初の数レッスンでは、チェックポイントを災害に対する保険として扱ってきました。プロセスがクラッシュし、直近のチェックポイントからループを拾い直す、という使い方です。そう使うこと自体に何の問題もありませんが、クラッシュした後にしか手を伸ばさないのであれば、チェックポイントはほとんどの時間ただ眠っていることになります。クラッシュしなかったのだから、保存した状態は無駄だったのでしょうか。

無駄ではありませんでした。積み上がったチェックポイントの連なりは、実のところタスクのタイムラインです。各ターンで何を考えていたか、何をしようとしていたか、どの効果をすでにコミットしていたか——そのすべてが痕跡として残っています。障害復旧の先に、このタイムラインはさらに2つの能動的な使い道を支えます。以前のターンへ巻き戻してやり直すことと、あるターンからフォークして2本目のルートを並行して走らせることです。ハーネスエンジニアリングを軸に構成されたコミュニティのロードマップは、永続性コンポーネントをまさにこの3つで括ってまとめています。あらゆるノードで状態をチェックポイントし、再開・巻き戻し・フォークができるようにする[^S5]。これはロードマップ側の枠組みとしての主張であって、実装を規定するものではありませんが、一つのことを指し示しています。再開はチェックポイントの用途の3分の1にすぎず、残る2つがこのレッスンの主題だ、ということです。

- **巻き戻し**: タスクはクラッシュしていないが、進路を外れた。判断の場面を、間違える前のターンまで戻して、やり直す。
- **フォーク**: どちらのルートが良いか確信が持てないので、同じ場面から独立したタイムラインを2本コピーし、それぞれ走らせて、結果を選ぶ。

どちらも「災害後の後始末」ではありません。どちらも、タスクが順調に走っている最中に持ち上がりうるものです。

## 巻き戻し: 巻き戻るのは判断の場面であって、外の世界ではない

20数ターンのツール呼び出しを走らせるタスクを思い浮かべてください。15ターン目でモデルが誤った判断を下します——編集するファイルを間違えて選ぶ、あるいは曖昧な要件について誤った前提を置く。そこから10ターン、モデルはその間違いの上に積み上げ続けます。このシリーズの第8コース「Context Engineering: Spending Finite Attention Where It Counts」では、コンテキストが長く雑然と積み上がるほど、モデルがそこから情報を正確に思い出す能力が落ちていくことを扱いました。しかもこの区間の履歴は、その上に誤った判断まで抱えています。進路を外れた長いコンテキストの中でモデルにもがき続けさせるくらいなら、誤判断の手前である14ターン目まで場面を戻し、そこからやり直すほうがよいのです。

そのためには、チェックポイントはもはや「最新の1つだけ」ではいられません。これまでのレッスンの`saveCheckpoint`は毎回同じ`checkpoint.json`を上書きしていたので、復旧時には最後に書かれた状態しか取り出せませんでした。障害復旧には十分ですが、巻き戻しには使えません。14ターン目の場面は、15ターン目にとっくに上書きされているからです。巻き戻しを支えるには、チェックポイントをターンごとの列として保持し、ターン番号と保存地点をファイル名に入れる必要があります。`checkpoints/turn-014-A.json`、`checkpoints/turn-014-B.json`、といった具合です。各ターンの中で、保存地点Aはモデルが計画を提示したがツールはまだ走っていない時点、保存地点Bはそのターンのツール結果が`messages`に書き戻され、ターンが本当に完了した時点に置かれます。既定では「ターンNに戻る」はそのターンが終わった後の場面、つまりそのターンで最後に書かれた保存地点を意味します。

```javascript
import fs from "node:fs/promises";
import path from "node:path";

function turnFileName(turn, point) {
  return `turn-${String(turn).padStart(3, "0")}-${point}.json`;
}

// あるターンで最後に書かれた保存地点を取る: A と B は辞書順に並び、B が A の後に来る。
// これは「ツール実行の前」->「ツール結果の記録後」という順序とちょうど一致する
async function pickLatestPoint(turn, dir) {
  const files = await fs.readdir(dir);
  const prefix = `turn-${String(turn).padStart(3, "0")}-`;
  const points = files
    .filter((f) => f.startsWith(prefix))
    .map((f) => f.slice(prefix.length, prefix.length + 1))
    .sort();
  if (points.length === 0) throw new Error(`ターン${turn}のチェックポイントがありません`);
  return points[points.length - 1];
}

async function rewindTo(turn, { point, dir = "checkpoints" } = {}) {
  const wanted = point ?? (await pickLatestPoint(turn, dir));
  const raw = await fs.readFile(path.join(dir, turnFileName(turn, wanted)), "utf8");
  return JSON.parse(raw); // { version, task, turns, tokensUsed, messages, pendingToolUse }
}
```

`rewindTo(14)`が返す場面を手にした後の流れは、再開とまったく同じです。この`messages`を使って履歴を組み直し、この`turns`のカウントからループを続けます。唯一の違いは、今回モデルが向き合うのが、判断が下される前のきれいな場面であって、15ターン目が汚染したコンテキストではない、という点です。

ただし、はっきり口に出して言っておくべきことが一つあります。巻き戻しが戻すのは**判断の場面**であって、**外の世界**ではありません。16ターン目の誤判断がすでに高影響ツールを呼んでいたら——たとえば実際にメールを送っていたら——14ターン目に巻き戻してもそのメールは戻ってきません。チェックポイントが保存するのは`messages`、`turns`、`pendingToolUse`、そのほかあなたがスナップショットに定義した状態フィールドであって、すでに着地した外部のアクションを取り消すようには作られていませんし、取り消すこともできません。レッスン4の副作用台帳（`effects.json`）は追記のみというルールに従い続けます。巻き戻して15ターン目からやり直した後、たとえモデルが今回まったく別のアクションを選んだとしても、台帳には新しいレコードが増えるだけで、古いレコードが消えることはありません。破棄された10ターンで起きたことは、それでも台帳に痕跡を残します。これはまさに、レッスン4の冪等性の見方を巻き戻しの場面に持ち込んだものです。

## フォーク: 一つの場面から2本のタイムラインを走らせる

巻き戻しは「このルートは間違いだった、戻ってやり直す」を解決します。しかし時には、問いが「間違っていたか」ではなく「どちらが良いか確信が持てない」であることもあります。2つのリファクタリング案がどちらも筋が通っていて、選ぶ前にそれぞれ走らせて比べたい、という場合です。そのときは破壊的にどちらかを選ぶのではなく、同じチェックポイントから独立したタイムラインを2本コピーして、それぞれ走らせます。

```javascript
async function forkFrom(turn, branchName, { point, baseDir = "checkpoints" } = {}) {
  const startPoint = point ?? (await pickLatestPoint(turn, baseDir));
  const state = await rewindTo(turn, { point: startPoint, dir: baseDir });

  const branchDir = `${baseDir}-${branchName}`;
  await fs.mkdir(branchDir, { recursive: true });
  await fs.writeFile(
    path.join(branchDir, turnFileName(turn, startPoint)),
    JSON.stringify(state, null, 2)
  );

  // 独立した副作用台帳: このタイムラインは自力で走り、それぞれが自分の副作用を
  // 記録する。本線の記録を引き継がない
  await fs.writeFile(path.join(branchDir, "effects.json"), "[]\n");
  return branchDir;
}
```

`forkFrom(14, "plan-b")`の後、`checkpoints-plan-b/`は自分専用のチェックポイント列と空の副作用台帳を持ちます。14ターン目以降、このタイムラインがどこへ向かうか、何ターン走るか、いくつチェックポイントを落とすか——そのどれも本線に干渉しません。

フォークした2本のタイムラインが独立しているという事実は、高影響ツールにとっては警告でもあります。両方のタイムラインが同じ、本当に外部に届くアクションを呼ぶ場合——たとえばどちらも同じメールを送る必要がある場合——承認なしにそれぞれを最後まで走らせると、各タイムラインが1回ずつ送信し、副作用が二重になります。そうしたツールに承認ゲートを取り付けるか、フォークの間はドライランモードに切り替えるかは、フォークする前にやっておく価値があります。巻き戻しても台帳は巻き戻らないのと同じ理屈です。チェックポイントは2つにコピーできますが、すでに着地した外部の効果は「並行世界ごとに1つずつ」へコピーすることはできません。

## 製品との比較: Claude Code はこれを機能として出荷している

ここまでの巻き戻しとフォークは、Claude Code がすでに製品グレードの機能として提供しているものです——これはあくまで比較のためであり、教えている対象そのものではありません。そのチェックポイント機構は、各ユーザープロンプトの前にコードの状態を自動で取得します[^S2]。ユーザープロンプトごとに新しいチェックポイントが作られ[^S2]、Claude Code はチェックポイントを会話とともに保存するので、セッションを再開した後でも`/rewind`を実行できます[^S2]。

その`/rewind`メニューは「何を復元するか」を3つの選択肢に分けています。"Restore conversation: rewind to that message while keeping current code"、"Restore code: revert file changes while keeping the conversation"、あるいは "Restore code and conversation: revert both code and conversation to that point"[^S2]（順に、コードは現在のまま会話だけをそのメッセージまで巻き戻す／会話は保ったままファイル変更を戻す／コードと会話の両方をその時点まで戻す）。これは、このレッスンの「巻き戻すのは判断の場面である」という一文をそのまま製品化したものになっています。判断の場面（会話）だけを戻すことも、コードごと戻すことも選べます。公式ドキュメントはチェックポイントの一般的なユースケースもいくつか挙げていて、"Exploring alternatives: try different implementation approaches without losing your starting point"（出発点を失わずに異なる実装アプローチを試す）や "Recovering from mistakes: quickly undo changes that introduced bugs or broke functionality"（バグを持ち込んだり機能を壊したりした変更を素早く取り消す）といったものです[^S2]。注意しておきたいのは、これらのユースケースはドキュメント上、チェックポイント機能（`/rewind`）の下に一括で列挙されているのであって、「巻き戻し」と「フォーク」に振り分けられているわけではない、という点です。とはいえ、このレッスンの2つの使い道——「間違えたので戻ってやり直す」と「確信が持てないのでフォークして試す」——と突き合わせてみると、方向性は一致しています。

フォークの側については、Claude Code は`/branch`または`claude --continue --fork-session`を提供しています。"To branch off and try a different approach while preserving the original session intact, use /branch or claude --continue --fork-session"[^S2]（元のセッションを無傷のまま保ちながら分岐して別のアプローチを試すには、/branch または claude --continue --fork-session を使う）。

## 境界と役割分担: チェックポイント、Git、副作用台帳はそれぞれ何を担当するか

Claude Code のドキュメントは、それ自身の境界線も引いています。そのチェックポイント機構は "does not track files modified by bash commands"[^S2]（bash コマンドが変更したファイルは追跡しない）、そして "Only direct file edits made through Claude's file editing tools are tracked"[^S2]（Claude のファイル編集ツールを通じた直接のファイル編集のみが追跡される）。同じ理屈で、あなた自身のハーネスのチェックポイントがカバーするのも、スナップショットに明示的に定義した状態フィールドだけです——`messages`、`turns`、`tokensUsed`、`pendingToolUse`。ツールが外の世界に加えた変更——データベースへの書き込み、別サービスの呼び出し、メールの送信——はチェックポイントの管轄外です。それは副作用台帳の仕事です。

公式ドキュメントはこの仕組みの役割をはっきり述べています。チェックポイントはセッションレベルの素早い復旧のために設計されており、長期的な履歴と共同作業については "continue using version control, such as Git, for commits, branches, and long-term history."[^S2]（コミット、ブランチ、長期履歴には Git のようなバージョン管理を使い続けること）。3つはそれぞれ別の領域を担当しており、並べてみるとより明確になります。

| 仕組み | 担当するもの | 時間スケール |
| --- | --- | --- |
| チェックポイント | 実行中の場面 — `messages`、ターン数、まだ実行されていないツール呼び出し | 分単位、セッションレベル |
| Git | コード自体の履歴 — コミット、ブランチ、共同作業 | 恒久的、共同作業 |
| 副作用台帳 | すでに起きた外部の副作用 — 送信されたメール、書き込まれたレコード | 追記のみ、恒久保持 |

```agentmentor-check
{
  "id": "sp-zh-05-checkpoint-vs-git",
  "label": "チェックポイントはバージョン管理を置き換えられるかを判断する",
  "prompt": "チームの誰かがこう提案します。チェックポイントがターン単位で巻き戻せるようになったのだから、Git のコミット履歴とだいぶ似た働きをする。これからはコード変更もチェックポイントで管理して、Git はやめてしまおう、と。この提案は成り立つでしょうか。",
  "whyHere": "チェックポイント、Git、副作用台帳の役割分担を読み終えた直後です。「チェックポイントで巻き戻せるなら、Git は要らないのでは？」という過剰な一般化が最も出やすいのがまさにここであり、この境界はその場で釘を刺しておく必要があります。そうしないと、分単位のセッション復旧と恒久的なコード履歴が読み手の中で一つに融けてしまいます。",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "成り立つ。チェックポイントはすでに各ステップの場面をターン単位で保存しており、version、turns、messages がすべて揃っているのだから、Git のコミット記録と同じ仕事をしている。巻き戻しも履歴の閲覧もチェックポイントでできる",
      "correct": false,
      "feedback": "チェックポイントが保存するフィールドは、1つのセッションの実行中の場面を組み直すために存在します。これは Git のコミットが記録するもの——コードファイルそのものを完全にバージョン管理した記録——とは別物です。チェックポイントはセッションレベルの素早い復旧のために設計されており、長期的な履歴と共同作業は依然として Git のようなバージョン管理の上に成り立っています[^S2]。両者は同じものを担当していないので、一方が他方を置き換えるという話にはなりません。"
    },
    {
      "id": "b",
      "text": "成り立たない。チェックポイントは分単位・セッションレベルの実行中の場面の復旧であり、Git はコード自体の恒久的で共同作業のための履歴だ。両者はまったく違うものを担当しており、互いの代わりにはならない",
      "correct": true,
      "feedback": "正しい。ドキュメントは境界をはっきり述べています。チェックポイントはセッションレベルの素早い復旧のために設計されており、長期的な履歴と共同作業には依然として Git のようなバージョン管理が必要です[^S2]。チェックポイントは bash コマンドが変更したファイルすら追跡せず、Claude 自身のファイル編集ツールを通じた編集だけを追跡します[^S2]。したがって、コードで実際に何が変わったかの記録は、そもそも Git よりはるかに狭いのです。チェックポイント、Git、副作用台帳はそれぞれの領域を担当しており、どれも他を置き換えません。"
    },
    {
      "id": "c",
      "text": "部分的には成り立つ。チェックポイントはすでに巻き戻せるので、巻き戻しを毎回記録しておけば実質的に簡易版のブランチ管理であり、操作の仕方が違うだけだ。段階的に Git を置き換えることもありえなくはない",
      "correct": false,
      "feedback": "チェックポイントの巻き戻しと Git のブランチ管理は、同じものの2通りの綴りではありません。チェックポイントは bash コマンドが変更したファイルすら追跡せず、Claude 自身のファイル編集ツールを通じた編集だけを追跡するため[^S2]、コード変更のカバー範囲は Git よりはるかに狭く、Git のコミット・マージ・共同作業の仕組みは一つも持っていません。その役割はセッションレベルの素早い復旧であって、バージョン管理の代替ではありません[^S2]。"
    }
  ]
}
```

## 保持コスト: トレードオフを選ぶ

ターンごとのチェックポイント列を保持することはタダではありません。1ターンあたり2つの保存地点があり、タスクが長く走るほどディスク上にファイルが積み上がります。Anthropic の "you should consider adding complexity only when it demonstrably improves outcomes"[^S3]（複雑さは、成果を明らかに改善する場合にのみ追加を検討すべき）という原則は、ここにもそのまま当てはまります。タスクが数ターンしか走らず、巻き戻しがめったに必要にならないのであれば、列全体を保持するのは見合わないかもしれません——これまでのレッスンのように、最新の1つだけ保持すれば十分です。逆に、タスクが数十ターン走り、いくつかのアプローチを試すために巻き戻しやフォークが日常的に必要になるなら、保持した列は元を取ります。何かがうまくいかなくても最初からやり直す必要がなく、試行錯誤のコストが下がるからです。これは結局のところ、タスクの規模に応じた判断であって、どちらのやり方が本質的に正しいかという問題ではありません。

<!-- exercises -->
## 💻 演習

### レベル1: 4つのシナリオ、正しい道具を選ぶ

以下の4つのシナリオそれぞれについて、巻き戻し・再開・フォーク・Git のどれを使うべきでしょうか。それぞれ答えと、その理由を述べてください。

1. あるタスクが20数ターン走った後、12ターン目でモデルが誤ったリファクタリング案を選んでいたことに気づいた。以降のターンはすべてその誤った案の上に積み上がっているが、プロセス自体はまだ正常に走っており、クラッシュはしていない。
2. 同じタスクが18ターン目に達したところで、ホストマシンが再起動され、プロセスが完全に落とされ、何も完了しなかった。
3. あるモジュールを2つのサービスに分けるべきか3つに分けるべきか確信が持てず、エージェントにそれぞれの案を1回ずつ走らせて、結果を比較したい。
4. このコードが3日前にどうなっていたか、そして誰がいつ変更したかを知りたい。

<!-- rubric -->
- シナリオ1は巻き戻しを選び、理由が「クラッシュしていないが判断が誤り、以降のターンがすべてその間違いの上に積み上がっている」を指している。再開でもフォークでもない
- シナリオ2は再開を選び、理由が「判断の誤りではなくプロセス全体が中断された」を指しており、巻き戻しではなくチェックポイントからの再開を使っている
- シナリオ3はフォークを選び、理由が「比較のための結果を得るには両方の案を実際に走らせる必要がある」を指しており、先にどちらかに賭けていない
- シナリオ4は Git を選び、理由が「コード自体のバージョン管理された履歴を問うており、時間スケールが分ではなく日である」を指していて、チェックポイントのセッションレベルの射程外だとしている

<!-- answer -->
1. **巻き戻し**。プロセスはクラッシュしていません。問題は12ターン目の判断そのものであり、その後の十数ターンがすべてその間違いの上に積み上がっています。すでに進路を外れた履歴の中で押し進めるくらいなら、誤判断の手前である11ターン目まで場面を戻し、まだ間違えていない判断の場面に差し替えてやり直すべきです。
2. **再開**。これは判断の問題ではありません。プロセス自体が完全に落とされただけで、12ターン目が何を考えていたかとは無関係です。必要なのは直近のチェックポイントからループを拾い直し、元の実行の場面を続けることであり、差し替えるべき判断はありません。
3. **フォーク**。これは「一方が間違っていたので戻る」ではありません。どちらの案も筋が通っており、どちらが良いかを知るにはそれぞれを実際に走らせる必要があります。現在のチェックポイントから独立したタイムラインを2本コピーし、それぞれに専用の副作用台帳を持たせて、別々に走らせます。片方に賭けて、物足りないとわかってから巻き戻してやり直すよりも直接的です。
4. **Git**。ここでの問いはコード自体について——「3日前にどうなっていたか、誰が変更したか」——であり、それはバージョン管理システムが管理するものです。恒久的な履歴で、時間スケールは分ではなく日にまたがります。チェックポイントはセッションの素早い復旧のためにターン単位で保持されるもので、通常そこまで長くは保存されませんし、まして「誰が変更したか」という共同作業のデータを記録するものでもありません。

<!-- hint -->
まず自分に問いかけてください。プロセスは完全に落とされましたか。落とされたなら再開です。落とされてはいないが進路を外れたなら、そこが巻き戻しの出番です。

<!-- hint -->
「どちらを選ぶか確信が持てない」と「すでに誤ったほうを選んでしまった」は同じではありません。前者は比較のためにフォークを、後者はやり直すために巻き戻しを求めています。そして「コード自体の履歴」が出てきたら、チェックポイントではなく Git を思い浮かべてください。

### レベル2: saveCheckpoint をターンごとの列に変える

以下のコードは、これまでのレッスンの古いバージョンです。毎回同じ`checkpoint.json`を上書きするので、再開は支えられますが巻き戻しは支えられません。このレッスンが求める形に書き直してください。ファイル名は`turn-NNN-A.json`／`turn-NNN-B.json`というターンごとの保持ルールに従うこと。再開用に、既定で最新ターンの最後に書かれた保存地点を返す`loadLatest()`を用意すること。そして特定のターンの場面を取り出す`rewindTo(turn)`を用意すること。書き終えたら検証を書いてください。5ターン分を連続して保存し、`rewindTo(3)`を呼び、返ってきた場面の`turns`が3であること、そして副作用台帳`effects.json`の長さが巻き戻っていないことを確認します。

```javascript
// 古いバージョン: 毎回同じファイルを上書きするので、「最新」しか取れず「ターンN」は取れない
import fs from "node:fs/promises";

async function saveCheckpoint(state) {
  const tmp = "checkpoint.json.tmp";
  await fs.writeFile(tmp, JSON.stringify(state, null, 2));
  await fs.rename(tmp, "checkpoint.json");
}

async function loadCheckpoint() {
  const raw = await fs.readFile("checkpoint.json", "utf8");
  return JSON.parse(raw);
}
```

<!-- rubric -->
- `saveCheckpoint` が書き直され、ディスク上のファイル名が `turn-NNN-A.json` ／ `turn-NNN-B.json` になっており、アトミックな書き込み（先に `.tmp` を書き、次に rename）を保っている
- 「あるターンで最後に書かれた保存地点」を見つけるロジックを備えており、`loadLatest()` が実行済みの最大ターンの中の最新の保存地点を正しく取得する
- `rewindTo(turn)` が指定ターンの場面を取得し、`effects.json` には一切触れない
- 検証スクリプトが通る: 5ターン保存した後に `rewindTo(3).turns === 3` となり、`effects.json` の長さは 5 のまま（巻き戻しの操作がそれを変えていない）

<!-- answer -->
```javascript
import fs from "node:fs/promises";
import path from "node:path";

function turnFileName(turn, point) {
  return `turn-${String(turn).padStart(3, "0")}-${point}.json`;
}

async function saveCheckpoint(state, turn, point, dir = "checkpoints") {
  const file = path.join(dir, turnFileName(turn, point));
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2));
  await fs.rename(tmp, file); // アトミックな書き込み: 先に tmp、次に丸ごと rename
}

async function pickLatestPoint(turn, dir) {
  const files = await fs.readdir(dir);
  const prefix = `turn-${String(turn).padStart(3, "0")}-`;
  const points = files
    .filter((f) => f.startsWith(prefix))
    .map((f) => f.slice(prefix.length, prefix.length + 1))
    .sort();
  if (points.length === 0) throw new Error(`ターン${turn}のチェックポイントがありません`);
  return points[points.length - 1];
}

async function rewindTo(turn, { point, dir = "checkpoints" } = {}) {
  const wanted = point ?? (await pickLatestPoint(turn, dir));
  const raw = await fs.readFile(path.join(dir, turnFileName(turn, wanted)), "utf8");
  return JSON.parse(raw);
}

async function loadLatest(dir = "checkpoints") {
  const files = await fs.readdir(dir);
  const maxTurn = Math.max(
    ...files.filter((f) => f.startsWith("turn-")).map((f) => Number(f.slice(5, 8)))
  );
  return rewindTo(maxTurn, { dir });
}

export { saveCheckpoint, rewindTo, loadLatest };
```

検証スクリプト（`effects.json`は同じアトミックな書き込みで追記され、再開も巻き戻しも決して触れない台帳を表しています）:

```javascript
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { saveCheckpoint, rewindTo, loadLatest } from "./checkpoint.mjs";

async function appendEffect(entry, file = "effects.json") {
  let ledger = [];
  try {
    ledger = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {}
  ledger.push(entry);
  await fs.writeFile(file, JSON.stringify(ledger, null, 2));
}

await fs.mkdir("checkpoints", { recursive: true });

for (let turn = 1; turn <= 5; turn++) {
  const stateA = {
    version: 1,
    task: "demo",
    turns: turn,
    tokensUsed: turn * 100,
    messages: [{ role: "user", content: `turn ${turn} A` }],
    pendingToolUse: { name: "send_email" },
  };
  await saveCheckpoint(stateA, turn, "A");

  const stateB = {
    ...stateA,
    messages: [...stateA.messages, { role: "user", content: `turn ${turn} B` }],
    pendingToolUse: null,
  };
  await saveCheckpoint(stateB, turn, "B");

  await appendEffect({ turn, action: "send_email" });
}

const rewound = await rewindTo(3);
assert.equal(rewound.turns, 3);
console.log("rewindTo(3).turns =", rewound.turns); // rewindTo(3).turns = 3

const effects = JSON.parse(await fs.readFile("effects.json", "utf8"));
assert.equal(effects.length, 5);
console.log("effects.json length =", effects.length); // effects.json length = 5

console.log("PASSED");
```

ローカルで`node verify.mjs`を実行すると、次が出力されます。

```
rewindTo(3).turns = 3
effects.json length = 5
PASSED
```

1行目は、`rewindTo(3)`が本当に場面を3ターン目まで戻したこと——最新の5ターン目へ再開したのではないこと——を証明しています。2行目は、巻き戻しの操作が判断の場面を組み直しただけであること、副作用台帳には一切触れておらず、それらのターンで本当に起きたことの5件のレコードがすべて残っていることを証明しています。

<!-- hint -->
「あるターンで最後に書かれた保存地点」はどう判断すればよいでしょうか。A と B は辞書順に並び、それが「ツール実行の前」→「ツール結果の記録後」という時間順とちょうど一致するので、ソートして最後の1つを取ればよいだけです。余分なタイムスタンプは要りません。

<!-- hint -->
副作用台帳は別ファイル（`effects.json`）であり、チェックポイントの列とは完全に独立しています。`rewindTo`の中にそれに触れるコードが1行もない限り、この検証は自然に通ります。特別に「守る」必要はありません。

<!-- /exercises -->

## まとめ

- チェックポイントは障害復旧の保険であるだけではありません。保持されたチェックポイントの連なりはタスクのタイムラインであり、再開の先に巻き戻しとフォークを支えます。あるコミュニティのロードマップは、この3つをまとめて永続性コンポーネントが担当するものとして枠づけています[^S5]
- 巻き戻しが戻すのは**判断の場面**であって、**外の世界**ではありません。本当に起きた外部のアクションは巻き戻しでは取り消されず、副作用台帳は追記のみのままです——レッスン4の冪等性の見方を巻き戻しの場面に持ち込んだものです
- 巻き戻しを支えるには、上書きして最新の1つだけを残すのではなく、チェックポイントをターンごとの列（`turn-014-A/B.json`のような形）として保持する必要があります。`rewindTo(turn)`は既定でそのターンの最後に書かれた保存地点を返します
- フォークは同じ場面から独立したタイムラインをコピーし、それぞれが専用のチェックポイント列と副作用台帳を持ちます。両方のタイムラインが同じ高影響ツールに当たるなら、承認ゲートを取り付けるかドライランモードに切り替えるのを忘れないでください——さもないと副作用が二重になります
- Claude Code はすでに巻き戻しとフォークを製品機能として出荷しています。プロンプトごとに自動作成されるチェックポイント、会話とコードを別々に復元できる`/rewind`、フォークのための`/branch`と`--fork-session`です[^S2]。ただしそれ自身の境界も引いています。追跡するのは Claude 自身のファイル編集ツールによる編集だけで、bash コマンドによる変更は追跡しません[^S2]。そして位置づけはセッションレベルの素早い復旧であり、長期的な履歴と共同作業は依然として Git が担当します[^S2]
- 3つの異なる仕事: チェックポイントは分単位の実行中の場面を、Git は恒久的で共同作業のためのコード履歴を、副作用台帳はすでに起きた外部の副作用を担当します。ターンごとのチェックポイント列を丸ごと保持することにはディスクのコストがあり、それが見合うかどうかはタスクの規模次第であって、どちらのやり方が本質的に正しいかという話ではありません[^S3]

[>> レッスン6: ハンズオン: ハーネスにチェックポイントと再開を配線する](./06-build-checkpointing.md)


