# レッスン4: ツールインターフェースの設計: 名前、説明、パラメータ、戻り値

> 学習目標:
> - ツールの説明が、モデルが適切なツールを選び、適切なパラメータを入力するのに十分かどうかを判断する
> - JSON Schemaのenumとrequiredを使ってパラメータの誤用の余地を狭め、strictモードをいつ使ってそれらの制約を厳密な保証に変えるべきかを判断する
> - モデルが自己修正できる戻り値とエラーメッセージを設計する
>
> 前提: レッスン3を修了し、5つのツールタイプ（read / write / execute / search / call）の違いを理解している | 前: [<< レッスン3](./03-tool-types.md) | 次: [レッスン5 >>](./05-permissions-and-safety.md)

## 1つのツール、2つの説明、2つの結果

あなたのツールボックスにコード検索ツールがあるとします。以下は、それが登録されている最初のバージョンです:

```json
{
  "name": "search_files",
  "description": "Search files",
  "input_schema": {
    "type": "object",
    "properties": {
      "query": { "type": "string" }
    },
    "required": ["query"]
  }
}
```

ユーザーが尋ねます: 「utils.tsはどのディレクトリにありますか？」

モデルが頼れるのは、この2行だけです — 名前と説明です。モデルには、`search_files`がファイルを名前で検索するのか、ファイルの内容内の文字列を検索するのかを判断する方法がありません。説明には何も書かれていません。モデルはこのツールを選び、`utils.ts`をクエリとして渡します:

```json
{ "id": "call_1", "name": "search_files", "input": { "query": "utils.ts" } }
```

このツールが実際には全文検索（各ファイルの内容内の`utils.ts`という文字列を探す）であり、どのファイルの内容にもこれらの文字が含まれていない場合、結果は空で返ってきます。モデルは空の結果を受け取り、ファイルが存在しないのか、検索アプローチが間違っているのかを判断できないため、推測します。よくある推測は、いくつかの類義語を試して再度検索することですが、空の結果を受け取り続けます。

次に、この説明に置き換えてみましょう:

```json
{
  "name": "code_search_grep",
  "description": "Search the contents of source files for lines matching a regular expression, returning file paths and line numbers. Use this to answer 'where in the code does a given variable/function/string appear'. To find files by their name (rather than by content), use the code_search_glob tool instead.",
  "input_schema": {
    "type": "object",
    "properties": {
      "pattern": { "type": "string", "description": "The regular expression to match" },
      "path": { "type": "string", "description": "Directory to start the search from; defaults to the project root" }
    },
    "required": ["pattern"]
  }
}
```

同じ質問ですが、今回はモデルが「ファイルを名前で見つけるには、code_search_globを使用してください」を読み、同じツールボックスに登録されているcode_search_globに直接切り替え、適切なパラメータを渡します:

```json
{ "id": "call_1", "name": "code_search_glob", "input": { "pattern": "**/utils.ts" } }
```

この2つの呼び出しの間で、何も変わっていません: 同じモデル、同じプロンプト、実装コードへの変更もありません。唯一の違いは、モデルがツール定義で読めるこれらの数行です — より正確な名前、境界を明示し、代替ツールを指名する説明、そして独自の説明を持つパラメータです。これがこのレッスンのテーマです: ツールインターフェースの各フィールドは、モデルが決定を下すときに推論できる唯一のものです。

## 説明は、モデルがツールを選ぶときに見る全てである

開発者は、API コメントを書くようにツールを書く傾向があります: 関数に意味のある名前を付け、ロジックを本体に入れ、必要な人がソースを読めるようにします。この習慣はツール定義では通用しません — **モデルはあなたの実装コードを読みません**。モデルが見ることができるのは、name、description、input_schemaフィールドだけです[^S3]。どのツールを選ぶか、どのパラメータを渡すかは、これらの数行にすべてかかっています。

説明の公式要件は直接的です: "A detailed plaintext description of what the tool does, when it should be used, and how it behaves."[^S3]（ツールが何をするか、いつ使用すべきか、どのように動作するかの詳細な平文での説明）この3つのいずれか1つでも欠けると、モデルは推測する必要があります。「何をするか」を欠くと、モデルはツールを完全にスキップし、結果を偽装するためにより長いルートを取る可能性があります。「いつ使用するか」を欠くと、ツールボックスに複数の類似したツールがある場合（例えばgrepとglobの両方）、モデルは境界がどこにあるかを判断できず、誤って選択する確率はツールの数とともに上昇します。「どのように動作するか」を欠くと、モデルは返ってくる結果の形状を知らないため、その結果を解析するための正しいフォローアップロジックを書くことができません。

良い説明は、"Avoid ambiguity by clearly describing (and enforcing with strict data models) expected inputs and outputs."[^S8]（期待される入力と出力を明確に記述（および厳密なデータモデルで強制）することで曖昧さを避ける）であり、優雅な表現を目指すのではありません。前のセクションの`code_search_grep`の説明が機能するのは、2つのことを行っているからです: 内容を検索し、ファイル名を検索しないことを明確にし、ファイルを名前で見つけるためのツールとして`code_search_glob`を指名します。これらの2つの文により、モデルは試行錯誤なしで類似したツール間で選択できます。

```agentmentor-check
{
  "id": "tool-zh-04-description-audience",
  "label": "説明が誰のために書かれているか",
  "prompt": "同僚は、詳細に説明を書くことは不要だと考え、次のように理論づけています: 「このテキストは、コードを保守する人がロジックを理解するために本当にあるものであり、モデルがたまたまそれも読むだけなので、言い回しに気を使う必要はありません」あなたはどう応答しますか？",
  "whyHere": "冒頭の例は、2つの説明がモデルを間違ったツールを選ぶことと正しいツールを選ぶことに導いたことをすでに示しています。これは、学習者が説明フィールドの読者が実際に誰であり、決定経路でどのような役割を果たしているかを理解しているかどうかを確認し、通常のコードコメントとして扱っていないかをチェックします",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "説明は主に後でこのコードを保守する人のためのコメントであり、モデルはその途中でたまたまそれを読むだけです",
      "correct": false,
      "feedback": "逆です。モデルがツールを選び、パラメータを入力するとき、見ることができるのはname、description、input_schemaフィールドだけです — 実装コードを見ることはできませんし、その中のコメントも見ることはできません。説明はモデルが「たまたま」読むナレーションではなく、モデルの決定の全体的な基礎です。同僚のためのメモは、コードコメントやドキュメントに属しますが、それはこのフィールドとは別のものです。"
    },
    {
      "id": "b",
      "text": "説明は、モデルがこのツールを呼び出すかどうか、何を渡すかを決定するときに読む唯一のテキストであり、実装コードを見ることはできません",
      "correct": true,
      "feedback": "正解です。だからこそ、冒頭の例で、同じツールの説明を1つ入れ替えただけで、モデルが間違ったツールを選ぶことから正しいツールを選ぶことに反転したのです — モデルの変更なし、実装の変更なし、モデルが読めるテキストだけです。"
    },
    {
      "id": "c",
      "text": "説明は主にトークンを節約するためのものなので、短ければ短いほど良い。システムプロンプトからモデルに使い方を推測させます",
      "correct": false,
      "feedback": "間違った方向です。曖昧な説明はトークンを節約しません — モデルが複数の類似したツール間で試行錯誤し、空の結果を受け取り、再試行し、これらの失敗したラウンドトリップは、いくつかの明確な文よりもはるかに多くのトークンを消費します。ツール数が十分に多くなったときにトークンコストは重要になりますが、それを解決するには、ツール数と粒度を削減することであり、各ツールの説明を曖昧に書くことではありません。"
    }
  ]
}
```

## 名前も所有権を示すべき: 名前空間

説明の仕事は、ツールが何をするかを明示することです。名前の仕事は異なります — 混雑したツールボックスで別のツールと混同されないようにすることです。多くのツールを持つようになると、特に複数の外部サービスを接続した後、`list_prs`、`send_message`、`create_issue`のような名前は、誰もが選ぶ可能性のある名前であり、名前だけではどのサービスに属しているかがわかりません。

公式のアドバイスは、ツール名にサービスをプレフィックスすることです: "When your tools span multiple services or resources, prefix names with the service (e.g., github_list_prs, slack_send_message). This makes tool selection unambiguous as your library grows, and is especially important when using tool search."[^S10]（ツールが複数のサービスやリソースにまたがる場合、サービス名をプレフィックスとして付けます（例: github_list_prs、slack_send_message）。これにより、ライブラリが成長するにつれてツールの選択が明確になり、ツール検索を使用する場合に特に重要です）モデルが数十のツールの中から1つを選ぶ必要がある場合、プレフィックスが付いた名前は最初にフィールドを絞り込むため、各説明を開いて1行ずつ比較することなく、ほとんどのオプションを除外できます。レッスン3の5つのツールタイプ（read、write、execute、search、call）も、それぞれが異なるサービスに支えられている場合、同じように恩恵を受けます: `fs_read_file`と`db_read_row`は一目で明らかに同じものではありませんが、単なる`read`ではそれらを曖昧にします。

## input_schema: パラメータの形状を固定する

説明は、モデルがこのツールを選ぶかどうかを決定します。input_schemaは、モデルがパラメータを正しく入力できるかどうかを決定します[^S3]。見逃しやすいことがあります: JSON Schemaでは、すべてのフィールドがパラメータを「制約」しているわけではありません — 一部のフィールドは「記述」しているだけです。

パラメータにdescriptionを追加しても、意図を述べるだけです。文が言うことに一致しない入力を拒否することはありません[^S14]:

```json
{
  "file_type": {
    "type": "string",
    "description": "Limits the search to a file type, e.g. typescript"
  }
}
```

モデルは`"typescript"`を渡すかもしれませんし、`"ts"`を渡すかもしれませんし、`"TypeScript files"`を渡すかもしれません — 説明は単なる提案であり、任意のものを渡すことを妨げるものはありません。実際に任意の値を止めるのはenumです:

```json
{
  "file_type": {
    "type": "string",
    "enum": ["js", "ts", "py", "all"],
    "description": "Limits the search to a file type"
  }
}
```

enumが配置されていると、有効な値が明示的にリストされ、モデルはほとんど常にそのいずれかを入力し、任意の値の確率は急激に低下します。しかし、注意してください: これはモデルへの強力なガイダンスであり、プラットフォームによる厳密な保証ではありません。デフォルトモードでは、APIはスキーマに対してパラメータを検証してくれず、モデルは時折、間違った型や必須フィールドの欠落を伴う入力を生成します[^S20]。したがって、ツール実装での無効な値のチェックは残しておく必要があります。requiredも同様です: 「ファイル書き込み」ツールが`path`をrequiredとしてマークしていない場合、モデルは時折それを省略し、実装はエラーを出すか、デフォルトのパスを推測する必要がありますが、どちらも良くありません。`path`をrequiredとしてマークすると、そのような誤用の確率は非常に低くなります — そして、「required」が実際にプラットフォームによって強制されるかどうかは、次のセクションのstrictモードに依存します。

**この区別を覚えておいてください**: type、enum、requiredは検証の観点から実際の制約ですが、titleとdescriptionはモデルのためのメモに過ぎません — どんなに詳細であっても、検証ルールを構成しません[^S14]。input_schemaを設計するとき、まず次のことを尋ねてください: このパラメータで「現れてはならない入力」は、説明に「xxxを渡してください」と書くだけではなく、enumやrequiredで完全にブロックできますか？これらの制約を「スキーマに書かれている」から「プラットフォームによって強制される」にアップグレードする方法は、次のセクションです。

## ソフトな制約を厳密な保証に変える: additionalProperties: falseとstrictモード

前のセクションでは、「制約する」と「記述する」の違いを強調し続けましたが、もう1つの層を区別しておく必要があります: スキーマに制約を書くことと、モデルが生成したパラメータが実際に検証を通過することは、まだ2つの異なることです。デフォルトモードでは、APIはスキーマに一致しない呼び出しを代わりに傍受してくれません — モデルは時折、数値を文字列`"2"`として書いたり、必須フィールドを単に省略したりします[^S20]。

もう1つの微妙な方向もあります: モデルはどこからともなくフィールドを追加する可能性があります。例えば、チケット作成ツールのスキーマが`title`と`priority`の2つのパラメータだけを宣言しているのに、1つの呼び出しが次のように返ってきたとします:

```json
{ "title": "Login page returns 500", "priority": "high", "skip_review": true }
```

その`skip_review`キーはスキーマのpropertiesには決してありませんでした。モデルが勝手に発明したのです。標準のJSON Schemaのデフォルトの動作は、オブジェクトが未宣言の追加キーを持つことを正確に許可することです — そして、ツール実装が入力全体を下流システムに渡し、下流コードが実際にそのフィールド名をチェックする分岐を持っている場合、1つのモデルの幻覚が、発生するはずだったレビューステップを静かにバイパスします。input_schemaのトップレベルに`"additionalProperties": false`を追加すると、「宣言されたキーのみが許可される」が検証ルールにも書き込まれます。

プラットフォームにこれらすべてを実際に強制させるには、ツール定義にトップレベルのフィールド`"strict": true`を追加します。strictモードの動作方法は、モデルのサンプリング自体を制約することです: "Setting strict: true on a tool definition guarantees Claude's tool inputs match your JSON Schema by constraining the model's token sampling to schema-valid outputs (a technique called grammar-constrained sampling)."[^S20]（ツール定義でstrict: trueを設定すると、モデルのトークンサンプリングをスキーマ有効な出力に制約することにより、Claudeのツール入力がJSON Schemaに一致することが保証されます（grammar-constrained samplingと呼ばれる技術））type、enum、required、additionalPropertiesはすべて尊重され、無効なパラメータは単に生成されません。公式ドキュメントでは、strictモードの例スキーマはすべて`additionalProperties: false`も含んでいます — この2つは一緒に使用されることを意図しています。この時点でのみ、「無効な値がリクエストが送信される前に除外される」が真に成り立ちます。strictモードがオンになっていないツールの場合、実装側でパラメータ検証の1行も削除できません。

## 戻り値: モデルが次に使用できるものを与える、人間のためのログではない

ツールが終了すると、その結果はtool_resultブロックにラップされ、モデルに返されます。コアフィールドは`tool_use_id`（これがどの呼び出しのためのものか）、`content`（結果）、`is_error`（失敗したかどうか）です[^S5]。これら3つのうち、最もひどく書かれることが多いのは、失敗時のcontentです。

「ファイル書き込み」ツールが、ディレクトリが存在しないために失敗したとします。2つの書き方があります:

```json
{
  "tool_use_id": "call_1",
  "content": "Error: ENOENT: no such file or directory, open '/reports/q3.csv'",
  "is_error": true
}
```

これは、システムログをそのまま返します。モデルは失敗したことはわかりますが、次に何をすべきかはわかりません — よくある結果は、モデルがまったく同じ呼び出しを再試行し、2回目に同じエラーに遭遇し、ループに陥ることです。

```json
{
  "tool_use_id": "call_1",
  "content": "Write failed: the directory /reports does not exist. Create it first with fs_create_dir, or switch to a path under a directory that already exists.",
  "is_error": true
}
```

同じ失敗ですが、このバージョンはモデルに3つのことを伝えます: 失敗が何だったか、それを修正するために呼び出すことができるツール、そして利用可能な他のパスです。MCP仕様は明示的です: "Clients SHOULD provide tool execution errors to language models to enable self-correction."[^S11]（クライアントは、自己修正を可能にするために、ツール実行エラーを言語モデルに提供すべきです）— このメッセージ自体が、修正するために必要な手がかりを含んでいることが条件です。コードをデバッグする人だけが読めるスタックトレースではありません。

## ツール数と粒度: 多ければ良いというものではない

より大きなツールボックスは、より良いものではありません。すべてのツール定義（name、description、input_schemaを組み合わせたもの）は、会話が始まる前にコンテキストにパックされる必要があり、多くのツールを持つようになると、そのオーバーヘッドは急速に増加します。Anthropicのエンジニアリングチームは数字を示しました: "That's 58 tools consuming approximately 55K tokens before the conversation even starts."（会話が真に始まる前に、55Kトークンを消費する58のツールです）— 会話が真に始まる前に、それだけのコンテキストが消費されます。彼らは内部でより極端なケースも見ています: "At Anthropic, we've seen tool definitions consume 134K tokens before optimization."[^S9]（Anthropicでは、最適化前にツール定義が134Kトークンを消費するのを見てきました）コンテキストが混雑すればするほど、モデルが実際のタスクについて推論するための余地が少なくなります。

高いツール数に伴う2番目の問題は、トークンとは無関係です: 選択が難しくなります。類似した機能を持つ複数のツールを積み上げると、モデルは「どれを使うべきか」の追加ステップに時間を費やす必要があり、間違える確率はツール数とともに上昇します — "More tools don't always lead to better outcomes."[^S8]（より多くのツールが常により良い結果をもたらすわけではありません）だからこそ、前のセクションでは、説明が境界を明示する必要があることを強調し続けていたのです。

逆 — 粒度が粗すぎる — も機能しません。read、write、delete、editを1つのinput_schemaに詰め込み、`action`パラメータで動作を区別する「ファイル操作」ツールは、モデルにまず正しい`action`値を推測させ、次にどのパラメータを入力するかを推測させます — `fs_read_file`や`fs_write_file`のような単一責任ツールに分割するよりもエラーが発生しやすいです。実用的なトレードオフ: まずレッスン3の5つのタイプに沿ってツールを分割し、次に、カウントが増えたら、名前空間と正確な説明で間違った選択の確率を制御します — カウントを抑えるために何でもできるツールを1つ積み上げるのではなく。

<!-- exercises -->
## 💻 演習

### レベル1: 曖昧なツール定義を書き直す

プロジェクトには「ファイル書き込み」ツールがあり、現在は次のように定義されています:

```json
{
  "name": "write_file",
  "description": "Write a file",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": { "type": "string" },
      "content": { "type": "string" }
    },
    "required": ["path", "content"]
  }
}
```

ツールボックスには、1つのことを行う`edit_file`ツールもあります: 既存のファイル内でローカルな置換を行います。モデルは、小さな変更のために`edit_file`を呼び出すべきときに、しばしば`write_file`を呼び出し、ファイル全体を上書きします。

`write_file`のdescriptionとinput_schemaを次のように書き直してください:

1. descriptionは、このツールがファイルの内容**全体を上書きする**ことを明確にし、ローカル変更のために`edit_file`を指す
2. input_schemaは、「ファイルが存在しないときに作成する」と「ファイルがすでに存在するときに上書きする」を区別するenum制約付きパラメータを追加し、モデルが誤って触ってはいけないファイルを上書きしないようにする
3. チェック: モデルが「config.jsonのポート番号を8080に変更する」を取得した場合、まだ`write_file`に手を伸ばしますか？

<!-- rubric -->
- descriptionは「ファイル全体を上書きする」動作を明示的に述べ、ローカル変更の代替としてedit_fileを指名している
- input_schemaには、作成と上書きを区別する1つのenum制約付きパラメータがある
- この変更が「edit_fileが正しい選択であるときにwrite_fileを呼び出す」確率を下げる理由を説明できる

<!-- answer -->
参考バージョン:

```json
{
  "name": "write_file",
  "description": "Create a new file, or overwrite the entire contents of an existing file. If you only need to change a small part of a file (e.g. one config value, one line of code), use edit_file to make a local replacement instead — don't use this tool to overwrite the whole file.",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": { "type": "string", "description": "Path of the target file" },
      "content": { "type": "string", "description": "The complete file contents to write" },
      "mode": {
        "type": "string",
        "enum": ["create_new", "overwrite_existing"],
        "description": "create_new: the file must not exist, otherwise error; overwrite_existing: allow overwriting a file that already exists"
      }
    },
    "required": ["path", "content", "mode"]
  }
}
```

主な変更点: descriptionは「ファイル全体を上書きする」と「代わりにedit_fileを使用する」を明示しているため、モデルが「ポート番号を変更する」のようなローカル変更リクエストを見たときに、最初にedit_fileを検討します。modeのenumは、モデルがこれが作成なのか上書きなのかを事前に明記することを強制するため、たとえまだwrite_fileを選択しても、それが上書きであることに気づかずに既存のファイルを上書きすることはありません。

<!-- hint -->
冒頭の例を振り返ってください: 「間違ったツールを選んだ」を解決するために、説明内で直接代替ツールを指名しています。この演習は同じパターンで、write_fileとedit_fileに入れ替えただけです。

<!-- hint -->
enumをどのパラメータに置くかは、モデルが呼び出す前に考えてほしいことに依存します。ここでは「この操作は実際に既存のファイルを上書きすることを意図しているか」なので、enumはそれを制約すべきであり、ファイルタイプのような無関係なパラメータではありません。

### レベル2: 悪い戻り値のために失敗した呼び出しを診断する

以下は、簡略化されていますが実際のラウンドトリップ記録です。「テスト実行」ツールが3回連続で呼び出され、毎回同じ入力でした:

```
呼び出し1: { "name": "run_tests", "input": { "suite": "unit" } }
返る: { "content": "Error: connect ECONNREFUSED 127.0.0.1:5432", "is_error": true }

呼び出し2: { "name": "run_tests", "input": { "suite": "unit" } }
返る: { "content": "Error: connect ECONNREFUSED 127.0.0.1:5432", "is_error": true }

呼び出し3: { "name": "run_tests", "input": { "suite": "unit" } }
返る: { "content": "Error: connect ECONNREFUSED 127.0.0.1:5432", "is_error": true }
```

次の質問に答えてください:

1. モデルが何か違うことを試すのではなく、同じパラメータで3回呼び出しを繰り返すのはなぜですか？
2. 実際の原因（データベース接続が拒否された。ポート5432で何もリスニングしていない）を解決するために、モデルは何をする必要がありますか？ツールボックスには`start_service`ツールもあると仮定します。
3. `content`フィールドを、2回目の呼び出しの前にモデルが正しいアプローチに切り替えるようなエラーメッセージに書き直してください。

<!-- rubric -->
- 元のエラーメッセージは「次に何をすべきか」についての手がかりがない生のログだけであるため、モデルは再試行を繰り返すしかないことを指摘している
- 根本原因（依存サービスが実行されていない）を利用可能なツール（start_service）に正しく接続している
- 書き直されたメッセージには、失敗の理由、提案されたアクション、および呼び出すべき特定のツール名が含まれている

<!-- answer -->
1. 元の戻り値は、基礎となるログ（`ECONNREFUSED 127.0.0.1:5432`）をそのまま返すだけで、`is_error: true`はモデルに「これは失敗した」ことだけを伝えます — なぜ失敗したか、次に何をすべきかは伝えません。モデルは、これが一時的な問題だと仮定し、同じパラメータで再試行するしかありません。これはまさに、MCP仕様の「実行可能なエラーメッセージをモデルに提供する」が回避しようとしていることです: 実行可能な情報がなければ、自己修正はなく、繰り返しだけです。

2. ポート5432はPostgreSQLのデフォルトポートであり、`ECONNREFUSED`は、テストが依存するデータベースサービスが実行されていないことを意味します。モデルは、最初に`start_service`を呼び出し（サービス名、例えば`postgres`を取ることができると仮定）、起動したことを確認してから、`run_tests`を再度呼び出す必要があります。

3. 参考バージョン:

```json
{
  "content": "Test run failed: can't connect to the local database service (nothing responding on port 5432); the postgres service the tests depend on is not currently running. Call start_service to start the postgres service first, confirm it started, then call run_tests again.",
  "is_error": true
}
```

<!-- hint -->
「モデルが見たもの」と「モデルがすべきこと」を最初に別々に書いてください — 生のログは最初の半分にしか答えません。

<!-- hint -->
良いエラーメッセージは、「次にどのツールを呼び出すか、何を渡すか」への回答のように読めるべきであり、人間のエンジニアのためのデバッグノートのようには読めません。

<!-- /exercises -->

## まとめ

- 説明は、モデルがツールを選び、パラメータを入力するときに見る唯一のテキストです。「何をするか、いつ使用するか、いつ使用しないか」を明示することは、優雅に書くことよりも重要です
- 名前にサービスプレフィックス（名前空間）を追加すると、多くのツールがある場合、モデルが最初に無関係なオプションの大部分を除外するのに役立ちます
- input_schemaでは、type、enum、requiredは検証の観点から実際の制約ですが、titleとdescriptionはメモに過ぎません。enumとrequiredを組み合わせると、任意の値の確率が非常に低くなり、「無効な入力は単に生成されない」を厳密な保証に変えるには、additionalProperties: falseとstrictモードが必要です[^S20]
- 戻り値 — 特に失敗時 — は、「なぜ失敗したか」と「次に何をすべきか」を明示する必要があり、モデルが逐語的に再試行するのではなく、自己修正できるようにします
- より多くのツールは良くありません: 定義はコンテキストトークンを消費し、ツールが類似すればするほど、モデルが間違って選択しやすくなります。粒度も「細かいほど良い」というわけではありません — まず機能で分割し、次に明確な命名と説明で間違った選択の確率を制御します

[>> レッスン5: 権限と安全性: エージェントができることの境界](./05-permissions-and-safety.md)
