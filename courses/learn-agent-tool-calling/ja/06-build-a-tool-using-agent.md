# レッスン6: ハンズオン: 3つのツールをエージェントに接続する

> 学習目標:
> - エージェントを実際に動作させる完全なツール実行ループを書く
> - ツールのインターフェース定義と実装を1つのテーブルに登録し、2つの側面が決して乖離しないようにする
> - ループに安全弁を取り付け、ログを読んでツールが誤接続されているタイミングを判断する
>
> 前提: レッスン1〜5を修了し、基本的なJavaScript / Node.jsを読むことができる | 前: [<< レッスン5](./05-permissions-and-safety.md)

## まずは結果: 1回の完全な実行

これがこのレッスンが構築するものです。ターミナルに1つの文を入力すると、エージェントは自分でどのツールを呼び出し、何回呼び出すかを決定します:

```
$ node agent.js "Are we using lodash in this project? Look into how it's doing on GitHub"

[turn 1] calls search_files { pattern: 'lodash', dir: '.' }
[turn 2] calls read_file { path: 'package.json' }
[turn 3] calls github_repo_info { owner: 'lodash', repo: 'lodash' }

Final answer:
Yes, the project uses lodash. package.json pins it at ^4.17.21, and
src/utils/format.js requires it directly. On GitHub, lodash/lodash
currently has over 60k stars, and its last push was a few weeks ago—the
repo is still maintained. To confirm whether ^4.17.21 is the latest
release, you'd need one more query against its release list.
```

3つのターン、3つのツール、そして各ターンの引数は前のターンの結果に基づいて構築されます: まずlodashが現れるファイルを見つけ、次にpackage.jsonを読んでバージョンを確認し、次にその名前を取得してGitHubについて尋ねます。これはハードコードされたスクリプトではありません — モデル自身が次にどのツールを呼び出し、どの引数を渡すかを決定します。

このレッスンはそれをゼロから構築します: 3つのツール、1つのレジストリ、1つの実行ループ、いくつかの安全弁。

## 裏で何が起こっているか: 次々と続くAPIのラウンドトリップ

上で見た各「ターン」は、裏では完全なHTTPリクエストです。レッスン2「ツール呼び出しの完全なラウンドトリップ」は、単一のツール呼び出しのラウンドトリップがどのように見えるかを示しました。ここでは、それをループに接続するだけです — モデルが`stop_reason: "tool_use"`を返し、あなたのコードがツールを実行し、結果を会話に戻し、モデルがツール呼び出しを要求しなくなるまで、別のリクエストを送信します。[^S4]

3つのツール呼び出しターンは、実際には`messages.create`への4回の呼び出しです: 最初の3回でモデルはツールを要求し続け、4回目にはGitHubのデータを持ち、十分だと判断し、テキスト回答を直接提供し、ループを終了します。ツールを要求し続けるかどうかの判断は完全にモデル側にあります。あなたのコードは実行して結果を返すだけです。

## ステップ1: 各ツールの契約を書く

レッスン4「ツールインターフェースの設計: 名前、説明、パラメータ、戻り値」は、ツールインターフェースの3つのコアフィールドをカバーしました: `name`、`description`、`input_schema`。[^S3]ここでは、それらを直接コードに変換します。3つのツールは、レッスン3「5つの一般的なツールタイプ: 読む、書く、実行する、検索する、呼び出す」の5つのツールタイプのうち3つにマップされます: search、read、call — writeとexecuteは、演習で接続してもらいます。

```js
const searchFilesSchema = {
  name: "search_files",
  description:
    "正規表現に一致するテキストを含むプロジェクトファイルを検索します。各ヒットのパス、" +
    "行番号、行の内容を返します。文字列、" +
    "依存関係名、または関数名がどのファイルに現れるかを特定するために使用します。" +
    "一致するものがない場合は、空の文字列ではなく、そのことを明示的に述べるテキストを返します。",
  input_schema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "JavaScript正規表現、先頭と末尾のスラッシュなし" },
      dir: { type: "string", description: "検索を開始するディレクトリ、プロジェクトルートからの相対パス、デフォルトは\".\"" },
    },
    required: ["pattern"],
  },
};

const readFileSchema = {
  name: "read_file",
  description:
    "プロジェクト内のファイルのテキストコンテンツを読み取り、最大で最初の4000文字を返します。" +
    "pathはプロジェクトルートからの相対パスでなければなりません。ツールはプロジェクトディレクトリ外のファイルにアクセスできません。",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "プロジェクトルートからの相対ファイルパス、例：\"package.json\"" },
    },
    required: ["path"],
  },
};

const githubRepoInfoSchema = {
  name: "github_repo_info",
  description:
    "公開GitHubリポジトリに関する基本情報を検索します：スター数、オープンissue数、デフォルトブランチ、最後のプッシュ時刻。" +
    "ownerとrepoは、リポジトリオーナーとリポジトリ名の2つの別々のフィールドです。完全なURLは受け付けられません。",
  input_schema: {
    type: "object",
    properties: {
      owner: { type: "string", description: "リポジトリオーナー、例：\"lodash\"" },
      repo: { type: "string", description: "リポジトリ名、例：\"lodash\"" },
    },
    required: ["owner", "repo"],
  },
};
```

`github_repo_info`には`github_`プレフィックスが付いています — 公式のガイダンスは、ツールが外部サービスに触れるときはツール名にサービス名を付けることで、モデルが間違ったツールを選ぶ可能性を大幅に下げます。[^S10]`search_files`と`read_file`はローカルファイルシステムで動作し、「どのサービス」という曖昧さがないため、プレフィックスは不要です。

3つすべての説明は、何も見つからなかったときに返ってくるテキストを明示しており、これは単なる埋め草ではありません。レッスン4は、良い説明は入力と出力の曖昧さを取り除くことを指摘しました。[^S8]ここでの曖昧さはパラメータにあるのではなく、ツールが「何も見つかりませんでした」をどのように表現するかにあります — 「安全弁」セクションで発動する罠です。

## ステップ2: 契約と実装を1つのテーブルに登録する

よくある罠: スキーマリストと実行時に使用されるハンドラールックアップテーブルが2つの別々のコピーとして書かれている場合、遅かれ早かれそれらは乖離します。`search_files`を`find_in_files`に名前変更しても、ハンドラーテーブルのキーを更新するのを忘れます。モデルは新しいスキーマに対して呼び出しを発行し、ハンドラーテーブルにはそのキーの下に何もなく、スローします。

修正は、`name`、`description`、`input_schema`、および実際に実行される関数がすべて同じオブジェクトに座る単一のテーブルを維持することです。APIが必要とするスキーマリストと実行が必要とするハンドラールックアップテーブルは、この1つのテーブルから派生します:

```js
const TOOLS = {
  search_files: { ...searchFilesSchema, handler: searchFiles },
  read_file: { ...readFileSchema, handler: readFile },
  github_repo_info: { ...githubRepoInfoSchema, handler: githubRepoInfo },
};

// モデルに送信されるtoolsパラメータ、TOOLSから派生
const toolSchemas = Object.values(TOOLS).map(({ handler, ...schema }) => schema);

// 実行時に使用されるハンドラールックアップテーブル、これもTOOLSから派生
const toolHandlers = Object.fromEntries(
  Object.entries(TOOLS).map(([name, t]) => [name, t.handler])
);
```

`toolSchemas`と`toolHandlers`は永遠に同期を保ちます。なぜなら、それらは同じデータから計算される2つのビューであり、2つの手書きのコピーではないからです。ツールの名前を変更したり、パラメータを追加したりすることは、`TOOLS`を正確に1か所で変更することを意味します。

## ステップ3: 3つのツールを境界付きで実装する

`searchFiles`は、`grep`にシェルアウトするのではなく、ディレクトリ自体を歩きます — これにより、ユーザー入力をコマンドラインに接合してコマンドインジェクションを招くことを回避します。ヒット数は制限されているため、単一の検索がコンテキストに数千行を詰め込むことはできません:

```js
import fs from "node:fs";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "coverage"]);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

async function searchFiles({ pattern, dir = "." }) {
  const root = path.resolve(PROJECT_ROOT, dir);
  // 比較する前にpath.sepを追加：単純なstartsWithは、/proj-backupのような
  // 同じプレフィックスの兄弟ディレクトリも通してしまいます
  const inRoot = root === PROJECT_ROOT || root.startsWith(PROJECT_ROOT + path.sep);
  if (!inRoot) {
    return "実行を拒否：検索ディレクトリはプロジェクトルートの外に出ることはできません。";
  }
  let regex;
  try {
    regex = new RegExp(pattern);
  } catch {
    return `実行を拒否："${pattern}"は有効な正規表現ではありません。`;
  }

  const hits = [];
  for (const file of walk(root)) {
    let lines;
    try {
      lines = fs.readFileSync(file, "utf8").split("\n");
    } catch {
      continue; // バイナリファイルなどはテキストとして読めないため、スキップします
    }
    lines.forEach((line, i) => {
      if (regex.test(line)) {
        hits.push(`${path.relative(PROJECT_ROOT, file)}:${i + 1}:${line.trim()}`);
      }
    });
    if (hits.length >= 20) break; // 安全弁：ヒットが多すぎる場合は早期に切り捨てる
  }
  return hits.length ? hits.join("\n") : "一致するコンテンツが見つかりませんでした。";
}
```

`readFile`は1つのことを行います: ターゲットパスがプロジェクトルートから逃げていないことを確認します。レッスン5からの境界のアイデアは、セパレータを持つ単一のプレフィックスチェックとしてここに現れます。単純な`startsWith(PROJECT_ROOT)`ではないことに注意してください: プロジェクトルートが`/Users/me/proj`で、モデルが`../proj-backup/x`を渡す場合、解決後に`/Users/me/proj-backup/x`を取得し、単純なプレフィックスマッチはまだ通過します — `path.sep`を追加すると、境界は最終的にディレクトリセパレータに着地します:

```js
async function readFile({ path: relPath }) {
  const abs = path.resolve(PROJECT_ROOT, relPath);
  const inRoot = abs === PROJECT_ROOT || abs.startsWith(PROJECT_ROOT + path.sep);
  if (!inRoot) {
    return "実行を拒否：パスはプロジェクトルートの外にあり、このツールはプロジェクト外のファイルを読み取ることは許可されていません。";
  }
  if (!fs.existsSync(abs)) {
    return `ファイルが存在しません：${relPath}`;
  }
  return fs.readFileSync(abs, "utf8").slice(0, 4000);
}
```

`githubRepoInfo`は、プロジェクト外にデータを送信する唯一のツールです — ローカルファイルコンテンツが、モデルによって2つの文字列`owner`と`repo`に凝縮され、次に公開インターネットに送信されます。これは、「プライベートデータを読む」と「外部に通信する」という2つの高リスク条件が満たされる正確なシナリオです。[^S19]そのため、明示的な権限ルールを取得します: 引数はGitHubの有効な命名形式に一致しなければならず、他のものは許可されません:

```js
const SAFE_NAME = /^[\w.-]+$/;

async function githubRepoInfo({ owner, repo }) {
  // 権限ルール：owner/repoは有効なリポジトリ名のみで、
  // 外部ネットワークに送信される任意の文字列ではありません
  if (!SAFE_NAME.test(owner) || !SAFE_NAME.test(repo)) {
    return "実行を拒否：owner/repo引数が有効な形式ではありません。外部リクエストはブロックされました。";
  }

  const headers = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
  if (!res.ok) {
    return `GitHub APIがエラーを返しました：${res.status} ${res.statusText}`;
  }
  const data = await res.json();
  return JSON.stringify({
    stars: data.stargazers_count,
    open_issues: data.open_issues_count,
    default_branch: data.default_branch,
    pushed_at: data.pushed_at,
  });
}
```

`GITHUB_TOKEN`は環境変数から読み取られ、決してコードに現れません。それなしでも実行されますが、匿名リクエストのレート制限が低くなります。これは、レッスン5の権限ルールと同じアイデアを異なる形式で表したものです: そのレッスンでは、Claude Codeの設定ファイル内の宣言的な`allow`/`deny`/`ask`ルールをカバーしました。[^S15]これは、ツールコードに書き込まれた命令的なバージョンです — どちらも、高リスク操作が越えることができない線を引きます。[^S18]

## ステップ4: 実行ループを書く

`toolSchemas`と`toolHandlers`を手に入れれば、ループ自体は複雑ではありません。コアロジックは4つのステップです: リクエストを送信し、`stop_reason`を見て、それが`tool_use`でない場合はテキストを返し、そうである場合は、すべてのツール呼び出しブロックを実行し、結果を戻します。[^S4]

```js
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MAX_TURNS = 8;

async function runAgent(question) {
  const messages = [{ role: "user", content: question }];

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5", // アカウントが呼び出せるモデルに変更
      max_tokens: 1024,
      tools: toolSchemas,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      const textBlock = response.content.find((b) => b.type === "text");
      return textBlock ? textBlock.text : "(モデルがテキスト回答を提供しませんでした)";
    }

    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      console.log(`[turn ${turn}] calls ${block.name}`, block.input);
      const handler = toolHandlers[block.name];
      const content = await handler(block.input);
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: String(content) });
    }
    messages.push({ role: "user", content: toolResults });
  }

  throw new Error(`最大ターン数を超えました (${MAX_TURNS})`);
}

const question = process.argv[2] ?? "Are we using lodash in this project? Look into how it's doing on GitHub";
runAgent(question).then((answer) => console.log("\n最終回答:\n" + answer));
```

ここには見逃しやすい詳細があります: `for (const block of response.content)`は**このターンに返されたすべてのコンテンツブロック**を反復し、最初のものだけではありません。モデルは多くの場合、1つのターンで2つまたは3つのツールを並行してリクエストします。それぞれが実行され、独自の`tool_result`を生成する必要があり、`tool_use_id`が1対1でマッチし、1つも欠けてはいけません。[^S5]レベル2の演習では、1つを見逃す罠を直接体験します。

## 安全弁、そしてツールが誤接続されているタイミングを判断する方法

上記のループは実行されますが、2つの安全策が欠けています。それらを追加します:

**安全策1: ツールの失敗はフィードバックされなければならず、ループをクラッシュさせることは許されません。**生の呼び出しを`try/catch`でラップし、失敗時にもまだ`tool_result`を生成し、ただ`is_error: true`でマークします — モデルがそのマークを見ると、通常、引数を調整して再試行し、同じエラーを繰り返すのではありません。[^S11][^S5]

```js
let content, isError = false;
try {
  if (!handler) throw new Error(`${block.name}という名前でツールが登録されていません`);
  content = await handler(block.input);
} catch (err) {
  content = `ツール実行エラー：${err.message}`;
  isError = true;
}
toolResults.push({
  type: "tool_result",
  tool_use_id: block.id,
  content: String(content),
  ...(isError ? { is_error: true } : {}),
});
```

**安全策2: 同じ引数で同じツールが3回連続で呼び出された場合、停止する必要があります。**これは推測ではありません — 最後のいくつかの呼び出しのシグネチャを記録することに基づいています:

```js
// これをrunAgent関数本体の先頭に置き、モジュールトップレベルには置かないでください — 各実行が
// ゼロから記録を開始し、同じプロセスでの2番目のタスクが前の実行の記録によって
// 誤って終了されることがないようにします
const recentCalls = [];

// ...for (const block of response.content)ループ内、ハンドラーを実行する前：
const signature = `${block.name}:${JSON.stringify(block.input)}`;
recentCalls.push(signature);
const last3 = recentCalls.slice(-3);
if (last3.length === 3 && last3.every((s) => s === signature)) {
  return "同じツールが同じ引数で3回連続で呼び出されたことを検出しました。実行が終了しました。";
}
```

マスタースイッチとしての`MAX_TURNS`と一緒に、3つの安全弁には異なる仕事があります: `MAX_TURNS`は「モデルが新しいバリエーションでツールを要求し続け、決して停止しない」のを防ぎます。繰り返し呼び出し検出は「モデルが同じ引数でスピンし続ける」のを防ぎます。そして、ツールの内部パスとフォーマットチェック（ステップ3で書かれたもの）は「モデルが範囲外の引数を作り上げ、ツールがそれをとにかく実行する」のを防ぎます。3つのレイヤーのいずれかを落とすと、ループは暴走したり、踏み越えたりするリスクがあります。[^S18]

**ログからツールが誤接続されていることをどのように判断しますか？**最も一般的な2つのシグナル:

- **モデルが同じツールを何度も呼び出す**、引数は狭い範囲内でのみ変化します（大文字小文字の変更、単語の追加または削除）。10回中9回、モデルは愚かではありません — `tool_result`のコンテンツが曖昧すぎるのです。「見つかりませんでした」が空の文字列を返すと、モデルは「本当に何もない」のか「ツールが壊れている」のかを判断できず、推測して再試行するしかありません。
- **モデルが引数を推測して入力する**、例えば、存在しないパスを`read_file`に渡します。トレースバックすると、通常、2つの原因のいずれかが判明します: `description`が引数がどこから来るべきかを明示しなかった（レッスン4のエコー）、または前のツールの出力が正確なパスを提供せず、モデルが1つを発明する必要があった。

```agentmentor-check
{
  "id": "tool-zh-06-diagnose-loop",
  "label": "エージェントが同じツールを呼び出し続ける理由を診断する",
  "prompt": "クラスメートがsearchFilesの一致しない戻り値を空の文字列に変更したとします（このレッスンの「一致するコンテンツが見つかりませんでした。」の代わりに）。「プロジェクトがmoment.jsを使用しているかどうかを確認する」を処理する際、この変更されたエージェントはsearch_filesを5ターン連続で呼び出し、正規表現を\"moment\"から\"Moment\"、\"MOMENT\"に変更しただけで、最終的にMAX_TURNSに達して終了します。プロジェクトは実際にmoment.jsを使用していません。このループの最も可能性の高い根本原因は何ですか？",
  "whyHere": "実行ループと安全弁をカバーした直後に、学習者が症状「モデルが同じツールを呼び出し続ける」を根本原因「tool_resultのコンテンツがステータスを明確に述べているかどうか」にマップできるかどうかを確認する必要があります。モデルの能力やターン制限を非難するのではなく",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "モデルが十分に能力がなく、ケースを区別できません。より強力なモデルに切り替えます",
      "correct": false,
      "feedback": "モデルを切り替えることは症状を治療しますが、原因ではありません。実際の問題はtool_resultにあります — 空の文字列は「ツールが壊れている」とほとんど区別できないため、モデルは「本当に見つかりませんでした」と「呼び出しが失敗した」を区別できず、言い換えて再試行するしかありません。"
    },
    {
      "id": "b",
      "text": "searchFilesが一致しない場合に空の文字列を返すため、モデルはそれを不確かな結果として読み取り、再試行します",
      "correct": true,
      "feedback": "正解です。tool_resultのコンテンツは、モデルが「このステップが完了したかどうか」を判断する唯一の基礎です。空の文字列は曖昧な信号です — モデルは何も見つからなかったのか、呼び出しが失敗したのかを確信できないため、別の正規表現を試します。戻り値を「一致するコンテンツが見つかりませんでした。」のような明示的なテキストに変更すると、モデルがそれを見たときに再試行を停止し、プロジェクトがこのライブラリを使用していないと直接結論付けます。"
    },
    {
      "id": "c",
      "text": "MAX_TURNSが低すぎる設定です。それを上げて、ループが自分で停止するかどうかを確認します",
      "correct": false,
      "feedback": "MAX_TURNSを上げることは、壁に当たる前にループがさらに数ターン回転するだけです。モデルが再試行する理由には対処しません。根本原因は、searchFilesが返す不明確な信号であり、ターン制限ではありません。"
    }
  ]
}
```

<!-- exercises -->
## 💻 演習

### レベル1: 動かして、次に4つ目のツールを接続する

このレッスンのコードを空のローカルディレクトリにコピーし、`npm install @anthropic-ai/sdk`を実行し、次に`npm pkg set type=module`（このレッスンのすべてのコードはESM `import`構文を使用します。Node 22.7未満のバージョンでは、このステップをスキップすると「Cannot use import statement outside a module」が直接スローされます）、`ANTHROPIC_API_KEY`を設定し（`GITHUB_TOKEN`はオプション）、`node agent.js "Are we using lodash in this project? Look into how it's doing on GitHub"`を一度実行します。少なくとも2つの異なるツール呼び出しターンと最終的なテキスト回答が表示されることを確認します。

実行されたら、4つ目のツール、`write_report(path, content)`を接続します: チェック結果をMarkdownファイルに書き込みます。プロジェクトの`reports/`ディレクトリの下でのみ許可され、他の場所への書き込みは拒否されます。1つのプロンプトを変更します。例えば「今集めたチェック結果をreports/lodash-check.mdに書き込んでください」、そしてモデルがこの新しいツールを自分で呼び出すことを確認します。

<!-- rubric -->
- 既存の3つのツールが実行され、ログに少なくとも2つのツール呼び出しターンが表示され、後のターンの引数が前のターンの結果を使用している
- `write_report`のパス制限が実際に有効になっている: `reports/../secret.txt`や`reports-evil/x.md`のようなパスを書き込もうとすると拒否される
- `write_report`が`TOOLS`テーブルに正しく登録されている: そのスキーマが`toolSchemas`に表示され、`toolHandlers`が対応する関数を検索できる

<!-- answer -->
コアは、`readFile`の境界チェックのアイデアをコピーし、「読み取り」を「書き込み」に入れ替え、許可された範囲をプロジェクトルート全体から単一の`reports/`サブディレクトリに絞り込むことだけです:

```js
const REPORTS_DIR = path.join(PROJECT_ROOT, "reports");

async function writeReport({ path: relPath, content }) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const abs = path.resolve(PROJECT_ROOT, relPath);
  const inReports = abs === REPORTS_DIR || abs.startsWith(REPORTS_DIR + path.sep);
  if (!inReports) {
    return "実行を拒否：ファイルはreports/ディレクトリの下にのみ書き込むことができます。";
  }
  fs.writeFileSync(abs, content, "utf8");
  return `${path.relative(PROJECT_ROOT, abs)}を書き込みました`;
}

const writeReportSchema = {
  name: "write_report",
  description: "テキストコンテンツをMarkdownファイルに書き込みます。reports/ディレクトリの下にのみ書き込むことができ、プロジェクトの他の場所には書き込めません。",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "プロジェクトルートからの相対パス、\"reports/\"で始まる必要があります" },
      content: { type: "string", description: "書き込む完全なテキストコンテンツ" },
    },
    required: ["path", "content"],
  },
};

TOOLS.write_report = { ...writeReportSchema, handler: writeReport };
```

<!-- hint -->
パスチェックは`readFile`と同じように書かれています: `path.resolve`の後、`path.sep`を追加してプレフィックス比較を行い、ベースを`PROJECT_ROOT`から`REPORTS_DIR`に入れ替えるだけです — セパレータを追加しないと、`reports-evil/`のような同じプレフィックスのディレクトリがチェックをすり抜けてしまいます。

<!-- hint -->
ファイルを書き込む前に、`fs.mkdirSync(REPORTS_DIR, { recursive: true })`を忘れないでください。そうでないと、`reports/`ディレクトリがまだ存在しない最初のときに、`writeFileSync`が直接スローします。

### レベル2: 失敗を作り出し、それを修正する

以下のループコードにはバグがあります。まず、どのような条件下で次のAPIリクエストがエラーを出すかを説明し、次に修正されたコードを提供してください。

```js
// バグのあるバージョン
const block = response.content.find((b) => b.type === "tool_use");
if (block) {
  const result = await toolHandlers[block.name](block.input);
  messages.push({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: block.id, content: String(result) }],
  });
}
```

<!-- rubric -->
- バグを正確にピンポイント: `.find()`を使用して最初の`tool_use`ブロックのみを取得すると、モデルが1つのターンで複数のツールを並行してリクエストしたときに、後の呼び出しが完全に無視されることを意味する
- 実際の症状を説明: 前のassistantメッセージにいくつの`tool_use`ブロックがあっても、次のターンにはそれと同じ数の一致する`tool_result`ブロックが必要で、不足すると直接エラーになる
- 修正は、`type === "tool_use"`のすべてのブロックを反復し、それぞれに一致する`tool_result`を生成し、それらすべてを1つの`user`メッセージに入れるように変更する

<!-- answer -->
バグは、1ターンあたり最大1つのツール呼び出しがあるという仮定ですが、実際には、モデルは完全に一度に2つまたは3つを並行してリクエストできます。修正は、このレッスンのステップ4で示された形式そのものです — `.find()`をすべてのブロックのループに置き換えます:

```js
const toolResults = [];
for (const block of response.content) {
  if (block.type !== "tool_use") continue;
  const result = await toolHandlers[block.name](block.input);
  toolResults.push({ type: "tool_result", tool_use_id: block.id, content: String(result) });
}
messages.push({ role: "user", content: toolResults });
```

<!-- hint -->
`response.content`内にいくつの要素が`type`を`"tool_use"`と等しくしている可能性があるかを数えてください — モデルは完全に一度に2つのツールを並行してリクエストでき、常に1つだけではありません。

<!-- hint -->
APIのルールは: 前のassistantメッセージにいくつの`tool_use`ブロックがあっても、次の`user`メッセージにはそれと同じ数の一致する`tool_result`ブロックが必要で、1つも欠けてはいけません。

<!-- /exercises -->

## まとめ

- ツールのスキーマとハンドラーを同じテーブル（`TOOLS`）に登録し、`toolSchemas`と`toolHandlers`の両方がそこから派生するため、1か所を変更しても、もう1か所が変更されないままになることはありません
- 実行ループのコアは: リクエストを送信 → `stop_reason`が`tool_use`かどうかを確認 → そうである場合、**すべての**ツール呼び出しブロックを反復し、実行し、`tool_result`を戻す → そうでない場合、テキストを返してループを終了
- 1つのターンに複数の並列ツール呼び出しがある場合があります。すべての`tool_use`には一意に一致する`tool_result`が必要で、1つ欠けると次のリクエストがエラーになります
- 3つの安全弁はそれぞれレイヤーを守ります: `MAX_TURNS`はモデルが無期限にツールを要求するのを止め、繰り返し呼び出し検出はモデルが同じ引数セットでスピンするのを止め、ツールの内部パスとフォーマットチェックは範囲外の引数を止めます
- `tool_result`のコンテンツは「見つかりませんでした」と「エラーが発生しました」を明確に述べる必要があります。曖昧な空の戻り値は、モデルが何度も再試行し、ログがツールが誤接続されているように見える第1の原因です

このコースの6つのレッスンすべてを修了しました。「なぜエージェントにツールが必要か」から、自分で動作するツール実行ループを書くまで。次に行う最も価値のあることは、別のレッスンを読むことではありません — 自分のプロジェクトから小さな実際のタスクを選び、それを2つまたは3つのツールに分解し、このループのスケルトンをいくつかの調整で持ち越すことです。一度動かすことは、10の説明を読むことに勝ります。デバッグ中で特定のフィールドについて確信が持てない場合は、`sources.md`に戻り、S4とS5を確認してください。それらは、このマルチターンループの最も主要な仕様テキストです。

