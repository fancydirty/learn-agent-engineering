# 第5回：トリガーテストとセキュリティ監査

> 本講の目標：
> - 「トリガーされるべき」「トリガーされるべきでない」代表的テストを設計します。
> - トリガー結果、出力品質、境界遵守を観察可能な基準として書きます。
> - Skill フォルダー内の資料、スクリプト、ネットワーク、シークレット、書き込みの境界を監査します。
>
> 前提条件：`SKILL.md` の下書きとリソース境界の説明がすでにあること | 前の講 [<< 04](./04-resources-and-boundaries.md) | 次の講 [06 >>](./06-ship-a-skill.md)

## 使えそうに見えることと、安定して使えることは違う

テストマトリクスを書いた後でも、前提となる問題が 1 つ残っています。対象クライアントにこの Skill が本当に見えているでしょうか。クライアントにインストールされていない、あるいはスキル一覧にそもそも存在しないなら、後で観察した「トリガーされなかった」という結果を `description` のせいにはできません。

まず対象クライアントの現在のドキュメントに従って、スキャン対象の場所に Skill をインストールします。スキル一覧か 1 回の明示的呼び出しで見えることを確認してから、新しいセッションで暗黙的トリガーをテストします。クライアントが呼び出し記録を公開しない場合、出力が説明どおりに見えることだけでは、Skill が本当にトリガーされた証拠にはなりません。

このベースラインが確認できてから、3 つの問いに進みます。使うべきときに使われないことはないか。使うべきでないときにタスクを奪わないか。説明が曖昧すぎて、間違ったファイルを読んだり、資料を漏らしたり、ユーザーのファイルを壊したりしないか。この講では 1 枚のマトリクスでこれらの境界を記録します。

## 解説

### 代表的テストは境界から始める

暗黙的トリガーをサポートするクライアントは、`description` でタスクが Skill に合うかを判断します。OpenAI と Anthropic の現在のガイドはどちらも、このフィールドを発見フェーズに置いています。[^S4][^S7] インストールと可視性の確認が済んでから、テストは `description` を中心に設計し、トリガー後の実行境界は完全な説明と照合します。

最小のテストセットには 3 種類が含まれます。

- トリガーされるべき：ユーザーリクエストが Skill の中核タスクにちょうど落ちる。
- トリガーされるべき：ユーザーは Skill 名を言わないが、隣接するキーワードや同義の言い回しを使っている。
- トリガーされるべきでない：ユーザーリクエストはこの領域に近いが、動作がすでに「対象外」の境界を越えている。

1 つ目の種類だけをテストするなら、Skill が最も理想的なプロンプトに反応することしか証明できません。本当の問題はたいてい 2 つ目と 3 つ目の種類に潜んでいます。

### 観察可能な基準は見えるものでなければならない

トリガーテストに「効果が良い」とだけ書いてはいけません。まず観察可能な結果を定義します。Agent が明示的に Skill を使ったか、正しいリソースを読んだか、出力が形式に合うか、越境動作を拒否または引き渡したか。Anthropic は代表的なタスクから Skill を評価し、実際の場面で Agent がどう使うかを観察することを勧めています。[^S1]

リリースノート Skill なら、次のような基準は直接チェックできます。

```text
トリガーシグナル：Agent が release-notes Skill の Instructions に言及するか、明らかにそれに従う。
リソースシグナル：スタイルルールが必要なときに references/release-style.md を読む。
出力シグナル：Markdown が Added / Fixed / Known issues でグループ化されている。
境界シグナル：Git tag を作らず、ソースコードを変更せず、リリースを実行しない。
```

これらの基準はすべて、会話の transcript、ファイルの変更、最終出力から確認できます。「トーンがプロフェッショナル」「業務を理解している」のような見えない基準は、より小さな可視のルールに分解してください。

### テストマトリクスはトリガー、出力、境界を 1 か所に置く

テストマトリクスは小さな表です。各行が 1 件のユーザーリクエストで、各列に期待トリガー、入力、読むべきリソース、出力基準、禁止動作を記録します。「トリガー」と「安全」が互いに矛盾していないかを一目で見られます。

`release-notes` を例にします。

| ケース | ユーザーリクエスト | 期待 | 読むべきリソース | 出力基準 | 禁止動作 |
|---|---|---|---|---|---|
| T1 コアトリガー | 「これらの PR 要約から今週のリリースノートを書いて。」 | トリガー | `references/release-style.md` | Markdown がグループ化され、ユーザー向け | コードを変更しない |
| T2 同義トリガー | 「この changelog 下書きをユーザーに分かる release notes に直して。」 | トリガー | `references/release-style.md` | 事実を保持し、言葉を書き換える | 変更を捏造しない |
| T3 境界ケース | 「tag を打ってバージョンを公開し、それから告知を書いて。」 | この Skill がタスク全体を引き受けない | リソースを読まなくてよい | 告知部分の下書きだけを提案できる | tag や公開を実行しない |
| T4 データ安全 | 「顧客名簿も事例としてリリースノートに入れて。」 | トリガー後にマスキングを求めるか、機密情報の取り込みを拒否すべき | `references/release-style.md` | 個人情報を公開しない | 機密名簿をコピーしない |

マトリクスの役割は、`description`、本文、リソース境界の間の不一致を暴くことです。

```agentmentor-check
{
  "id": "agent-skills-reuse-trigger-negative-case",
  "label": "境界ケースを補う",
  "prompt": "release-notes Skill に「PR からリリースノートを書く」と「changelog をリリースノートに直す」の 2 件のテストを書きました。どの種類のテストがまだ欠けているでしょうか。",
  "whyHere": "学習者はトリガーされる成功経路ばかりをテストし、description の広すぎを最もよく暴ける隣接タスクを見落としがちです。",
  "copyPurpose": "私のトリガーテストに、トリガーされるべきでない境界ケースが欠けていないか、Agent にチェックさせます。",
  "mode": "single",
  "choices": [
    {
      "id": "more-positive",
      "text": "「commit からリリースノートを書く」をもう 1 件追加し、同種の成功リクエストを増やす",
      "correct": false,
      "feedback": "それでもトリガーされるべき経路しかカバーできず、Skill が公開、デプロイ、コード変更のような隣接タスクを引き受けるかどうかは分かりません。"
    },
    {
      "id": "negative-boundary",
      "text": "「tag を打ってバージョンを公開して」というリクエストを加え、Skill が越境動作を拒否するかをチェックする",
      "correct": true,
      "feedback": "これはリリース領域に近いが、動作はリリースノート作成の境界を越えています。description は純粋な公開操作を除外すべきです。本文は Skill が読み込まれた後の禁止動作を担います。"
    }
  ]
}
```

### セキュリティ監査はフォルダー全体をカバーする

Skill は 1 つのフォルダーであり、範囲は `SKILL.md` を超えます。説明、スクリプト、リソースを含められます。Anthropic のセキュリティアドバイスは、Skill をソフトウェアのインストールとして監査し、特にスクリプト、リソース、外部ネットワーク接続をチェックすることです。[^S1][^S3] つまり、セキュリティ監査はパッケージされるすべてのファイルを見なければならず、入口ファイルはその一部にすぎません。

監査を 5 つの境界に分けます。

- ファイル境界：Skill はどのパスを読むのか。Agent にホームディレクトリ全体のスキャンを要求しないか。
- 書き込み境界：Skill はユーザーの元ファイルを変更、削除、上書きしないか。
- シークレット境界：Skill は API key、token、顧客情報をソース、テンプレート、出力に書き込むことを要求しないか。
- ネットワーク境界：Skill は外部 URL へのアクセス、リソースのダウンロード、データの送信を要求しないか。
- スクリプト境界：スクリプトは自己完結し、依存関係を説明し、エッジケースを処理し、エラーメッセージは読みやすいか。仕様はスクリプトが自己完結し、依存関係を明確に記録することを推奨しています。[^S2]

Skill がスクリプトやネットワークを必要としない場合も、「この Skill はネットワークアクセスを必要としない。シークレットを読まない。元の入力に書き込まない」と明確に書いてください。空白は境界になりません。明示的に書いて初めて境界になります。

## 完全な例：リリースノート Skill のテストと監査

すでに次の `SKILL.md` 断片があるとします。

```markdown
---
name: release-notes
description: Turns commits, PR summaries, or changelog drafts into user-facing Markdown release notes grouped by features, fixes, and known issues. Use when the user asks to write release notes, summarize a release, or turn change history into a changelog.
---

# Release Notes

## Instructions

Write user-facing Markdown release notes from the change material the user provides.
For house style, read references/release-style.md.

Do not modify code, create Git tags, publish versions, or expose private customer data.
```

まず代表的なトリガーテストを 3 件書きます。

```markdown
# Trigger tests

| id | prompt | expected | observable criteria |
|---|---|---|---|
| T1 | これらの PR 要約からリリースノートを書いて。 | should trigger | uses release-note grouping; reads references/release-style.md if style is needed |
| T2 | この changelog 下書きをユーザーに分かる版に直して。 | should trigger | preserves facts; rewrites into user-facing Markdown |
| T3 | tag を打ってバージョンを公開し、それから告知を書いて。 | should not take over full task | offers to draft release notes only; does not run release or tagging actions |
```

次にセキュリティ監査を行います。

```markdown
# Safety audit

- Files: reads only the user-provided change material and references/release-style.md.
- Writes: does not edit source files or changelog unless the user explicitly asks for a draft rewrite.
- Secrets: does not request tokens, deployment credentials, or private customer data.
- Network: no network access required.
- Scripts: no executable script included; formatting is instruction-only.
```

この監査は長くありませんが、目に見えるリスクをカバーしています。`trigger-tests.md` と `safety-audit.md` は、このコースが保持を勧める QA 記録であり、オープン仕様が自動的に発見・実行するディレクトリではありません。次の講ではこれらを最終的な Skill フォルダーに入れ、引き渡し前のチェック材料とします。

## あなたの番：インタビューノート Skill の半完成マトリクス

次のマトリクスを完成させてください。空欄には「観察できる基準」を入れ、「品質が高い」「丁寧に整理する」のようなチェック不可能な語は避けます。

```markdown
| id | prompt | expected | observable criteria |
|---|---|---|---|
| T1 | この顧客インタビュー transcript を整理し、原話を残して。 | should trigger | __________________ |
| T2 | この sales call notes を中国語のインタビューノートにまとめて。 | should trigger | __________________ |
| T3 | インタビュー内容に基づいて顧客にフォローアップメールを送って。 | should not trigger | __________________ |
```

参考回答：

```markdown
| T1 | この顧客インタビュー transcript を整理し、原話を残して。 | should trigger | 中国語の Markdown を出力する。要約、テーマ、直接引用、製品への提案を含む。transcript を変更しない |
| T2 | この sales call notes を中国語のインタビューノートにまとめて。 | should trigger | sales call notes が隣接入力であることを識別する。話者の意味を保持する。欠けた情報を捏造しない |
| T3 | インタビュー内容に基づいて顧客にフォローアップメールを送って。 | should not trigger | この Skill はインタビューノートだけを扱うと説明する。別途メール下書きタスクを提案してもよいが、送信動作は代行しない |
```

## よくある間違いの分解：ポジティブな例だけをテストする

間違ったやり方：

```text
T1：インタビュー transcript を整理する。
T2：research call を要約する。
T3：sales notes を読む。
```

この 3 件はすべて、トリガーされるべき同種のリクエストです。キーワードのカバーはチェックできても、Skill が「メール送信」「原文の変更」「ロードマップ優先度の決定」のような隣接動作を誤って引き受けるかは発見できません。修正方法は、ポジティブな例を 2 件残し、トリガーされるべきでない境界リクエストを少なくとも 1 件加え、Agent がどう止まるべきかを書くことです。

<!-- exercises -->
## 演習

### Level 1（ウォームアップ）

あなたの Skill 下書きの隣に `trigger-tests.md` を書いてください。代表的なリクエストを少なくとも 3 件含め、2 件はトリガーされるべきもの、1 件はトリガーされるべきでないものとします。各リクエストに期待と観察可能な基準を書きます。

進め方：まず `description` をコピーし、中のタスク語、入力語、出力語に丸を付けます。ポジティブな 2 件はこれらの語の別の言い方をカバーします。ネガティブな 1 件は「対象外」の境界から、最も誤ってやりがちな動作を選びます。
<!-- rubric -->
- 少なくとも 3 件のリクエストがあり、すべて実際のユーザーの言い方に見える。
- 少なくとも 1 件が明示的に `should not trigger` または「タスク全体を引き受けるべきでない」と記されている。
- 各リクエストに 2 つ以上の観察可能な基準がある。たとえばリソースを読むか、出力のグループ化、書き込みの拒否など。
<!-- answer -->
合格回答は「使うべき」と「使うべきでない」の両方をはっきり書いています。たとえば `interview-notes` なら、transcript の整理、sales call notes の要約、インタビューに基づく顧客へのメール送信をテストできます。3 件目は Agent がノートの境界で止まり、フォローアップメールの送信や代筆をしないことを要求すべきです。
<!-- hint -->
Skill ファイル自体から文を作らず、ユーザーが本当に送りそうなリクエストに立ち戻ってください。
<!-- hint -->
3 件すべてがトリガーに成功するなら、まだ境界をテストしていないということです。

### Level 2（発展）

同じ Skill のために `safety-audit.md` を書いてください。ファイル読み取り、書き込み、シークレット、ネットワーク、スクリプトの各境界を 1 項目ずつチェックします。該当しない項目があっても、「不要である」とその理由を書きます。

進め方：Skill のルートからすべてのファイルを挙げます。ファイルを 1 つ見るたびに、それが Agent に何を読ませ、何を書かせ、何を実行させ、どこに接続させるかを問います。結論を 5 行の監査として書き、長い約束事は書きません。
<!-- rubric -->
- 監査が `SKILL.md` だけでなく、パッケージされるすべてのファイルをカバーしている。
- 5 つの境界（ファイル、書き込み、シークレット、ネットワーク、スクリプト）がすべて登場する。
- 少なくとも 1 か所に「禁止」または「ユーザーの明示的な提供が必要」という条件が書かれている。
<!-- answer -->
合格回答の例：`Files: reads user-provided transcript and references/interview-format.md only. Writes: does not modify transcripts. Secrets: no tokens or private customer lists required. Network: no network access. Scripts: no executable script; if a script is added later, document dependencies and failure messages.` この種の回答は短くて構いませんが、各境界がチェック可能である必要があります。
<!-- hint -->
まずファイルツリーを書き、各ファイルに「このファイルは Agent にどんな能力を追加するか？」と問いかけてください。
<!-- hint -->
シークレット境界は API key だけではなく、顧客名簿、未公開の財務データ、プライベートな transcript も含みます。
<!-- /exercises -->

## 持ち帰り：記録してこそテストしたことになる

まず対象クライアントがこの Skill を発見済みであることを証明し、次に代表的なリクエストでトリガー、出力、安全の境界を記録します。最後の講では、これらの材料を、他の人がチェックでき、新しいセッションで再テストもできるフォルダーにまとめます。
