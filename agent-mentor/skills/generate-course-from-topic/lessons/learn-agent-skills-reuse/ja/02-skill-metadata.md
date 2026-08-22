# 第2回：SKILL.md のメタデータ構造

> 本講の目標：
> - オープン仕様が要求する最小限の `SKILL.md` 構造を書きます。
> - メタデータブロックと本文の役割を区別します。
> - `description` に Skill が何をするかと、いつトリガーされるかの両方を書きます。
>
> 前提条件：4 行の Skill ブリーフが完成していること | 前の講 [<< 01](./01-prompt-to-skill.md) | 次の講 [03 >>](./03-progressive-disclosure.md)

## Agent が最初に見るのは完全な説明ではない

4 行ブリーフはできました。しかし、それをそのまま Markdown ファイルに放り込んでも、Agent はそれが Skill だとは分からず、いつ読み込むべきかも分かりません。Agent Skills をサポートするクライアントは、まず `name` と `description` を見て、タスクにマッチしてから完全な `SKILL.md` を読みます。[^S1][^S4]

2 つ目のステップは、静的チェックが認識でき、Agent が正しくトリガーできる最小限の `SKILL.md` を書くことです。長い説明は、入口が機能してから足します。

## 解説

### 最小構造は 2 層だけ

オープン仕様は、`SKILL.md` が YAML frontmatter とそれに続く Markdown 本文を含むことを要求します。frontmatter には少なくとも `name` と `description` が必要です。本文には、Agent が Skill を有効化した後に従うべき操作指示を書きます。[^S2][^S7]

最小限のファイルは次のようになります。

```markdown
---
name: interview-notes
description: Turns customer interview transcripts into Chinese Markdown notes with quotes, themes, and product suggestions. Use when the user asks to summarize interviews, research calls, or transcript notes.
---

# Interview Notes

## Instructions

Read the transcript the user provides. Produce Chinese Markdown notes with:

- a short summary
- quoted evidence from the customer
- recurring themes
- 3 product suggestions

Do not edit the original transcript, send follow-up messages, or decide roadmap priority.
```

frontmatter はファイル先頭の YAML メタデータブロックで、上下 2 行の `---` に挟まれています。本文は frontmatter の後に続く Markdown の指示です。この区別は重要です。メタデータは Agent が Skill を発見するのを助け、本文は Agent が Skill を実行するのを助けます。

### `name` は安定した識別子

`name` は Skill の機械可読な名前です。オープン仕様は、1 から 64 文字、小文字の英数字とハイフンのみ使用可、ハイフンで始まったり終わったりしない、連続ハイフンを含まない、そして親ディレクトリ名と一致することを要求します。Anthropic の現在のベストプラクティスも同じ長さと文字の制限を示しています。[^S2][^S7]

つまり、次の名前にはそれぞれ別の問題があります。

```yaml
name: InterviewNotes      # 大文字を含む
name: interview_notes     # アンダースコアを含む
name: -interview-notes    # ハイフンで始まる
name: interview--notes    # 連続ハイフン
```

合格する名前はディレクトリ名のようになります。

```yaml
name: interview-notes
```

命名は面白さよりも、安定・短さ・可読性を優先してください。これはタイトルでもキャッチコピーでもありません。

### `description` は能力とトリガーの両方を担う

`description` は、Agent が Skill を読み込むかどうかを判断するための短い説明です。仕様は、空でないこと、最大 1024 文字であることを要求し、Skill が何をするかといつ使うかの両方を述べ、Agent がタスクを識別する助けになるキーワードを含めることを推奨しています。OpenAI と Anthropic の現在のガイドはどちらも、暗黙的マッチングをこのフィールドに置いています。[^S2][^S4][^S7]

弱い書き方：

```yaml
description: Helps write notes.
```

この文は入力、出力、トリガー場面を何も示していません。より具体的な書き方：

```yaml
description: Turns customer interview transcripts into Chinese Markdown notes with quotes, themes, and product suggestions. Use when the user asks to summarize interviews, research calls, or transcript notes.
```

この文の前半は能力を、後半はいつトリガーするかを示しています。4 行ブリーフを機械的に 2 か所に移してはいけません。能力、肯定的なトリガー、必要な否定的曖昧さ解消は `description` へ。入力の詳細、完全な出力要件、実行上の禁止事項は本文へ。ある「対象外」が、この Skill をそもそも選ぶべきでないという判断を左右するなら、否定的曖昧さ解消として圧縮して `description` に入れ、具体的な禁止事項は本文に残します。

本講の用語：

- `SKILL.md`：Skill ディレクトリに必須の入口ファイルで、メタデータと指示を含みます。
- frontmatter：Markdown ファイル先頭の YAML メタデータブロック。
- `name`：命名制限を守り、親ディレクトリと一致する安定した識別子。
- `description`：Skill が何をするか、いつトリガーするかを述べる短いテキスト。

```agentmentor-check
{
  "id": "agent-skills-reuse-description-trigger",
  "label": "トリガー記述をチェックする",
  "prompt": "インタビューノート Skill をいつ読み込むべきかを Agent が判断するのに、どちらの description が適しているでしょうか。",
  "whyHere": "description を漠然とした能力紹介として書くのではなく、能力とトリガーの両方を書けているかを確認するステップです。",
  "copyPurpose": "私の description に「何をするか」と「いつトリガーするか」の両方が含まれているか、Agent にチェックさせます。",
  "mode": "single",
  "choices": [
    {
      "id": "vague",
      "text": "曖昧な description：Helps with customer content.",
      "correct": false,
      "feedback": "安定した入力、出力、トリガーのキーワードが示されていないため、Agent はいつ読み込むべきか判断しにくくなります。"
    },
    {
      "id": "specific",
      "text": "能力とトリガーが明確な description：Turns customer interview transcripts into Chinese Markdown notes with quotes and themes. Use when summarizing interviews, research calls, or transcript notes.",
      "correct": true,
      "feedback": "能力、出力の形、トリガー場面のすべてが書かれており、メタデータ層での素早い判断に適しています。"
    }
  ]
}
```

## 完全な例：最小限のチェック可能な SKILL.md

前の講のブリーフが次のようだったとします。

```text
トリガー：ユーザーが顧客インタビュー、ユーザー調査の transcript、sales call notes の整理を求めたとき。
入力：1 件以上の transcript テキスト。話者と時系列が含まれていることが望ましい。
出力：中国語の Markdown ノート。テーマ要約、顧客の原話の証拠、質問リスト、製品への提案 3 件を含む。
対象外：元の transcript の変更、ユーザーに代わるメール送信、ロードマップの優先順位決定。
```

まずディレクトリ名と `name` を作ります。

```text
interview-notes/
  SKILL.md
```

次に最小限の `SKILL.md` を書きます。

```markdown
---
name: interview-notes
description: Turns customer interview transcripts into Chinese Markdown notes with quoted evidence, themes, open questions, and product suggestions. Use when summarizing interviews, research calls, sales call notes, or transcript files.
---

# Interview Notes

## Instructions

Use this skill when the user provides or points to customer interview transcripts, research call notes, or sales call notes.

Input can be one or more transcript files or pasted transcript text. Preserve customer meaning and mark direct quotes clearly.

Return Chinese Markdown with:

- summary
- quoted evidence
- recurring themes
- open questions
- 3 product suggestions

Do not modify the original transcript, send follow-up messages, or decide roadmap priority.
```

これが最も基本的な静的チェックを通る理由は、frontmatter が存在し、`name` が合法でディレクトリと一致し、`description` が空でなく能力とトリガーを含み、本文が実行ルールを示しているからです。

## 途中までの例：リリースノート SKILL.md

次のブリーフから `name` と `description` を完成させてください。

```text
ディレクトリ名：release-notes
トリガー：ユーザーが Git commit、PR、changelog の下書きからリリースノートの生成を求めたとき。
出力：ユーザー向けの Markdown リリースノート。新機能、修正、既知の問題でグループ化する。
```

半完成品：

```markdown
---
name: __________________
description: __________________
---

# Release Notes

## Instructions

Write user-facing Markdown release notes from the change material the user provides.
```

参考回答：

```yaml
name: release-notes
description: Turns commits, PR summaries, or changelog drafts into user-facing Markdown release notes grouped by features, fixes, and known issues. Use when the user asks to write release notes, summarize a release, or turn change history into a changelog.
```

注意点として、`description` にすべての操作詳細を詰め込む必要はありません。まず Agent が「このタスクは自分を読み込むべきか」を判断できるようにします。

<!-- exercises -->
## 演習

### Level 1（ウォームアップ）

自分の実際の作業ディレクトリの隣に練習用ディレクトリ、たとえば `skill-drafts/<your-skill-name>/` を作り、前の講のブリーフに対応する最小限の `SKILL.md` を書いてください。プライベートなデータは置かず、構造と説明だけを書きます。

進め方：まずディレクトリ名を小文字の kebab-case にし、`name` をディレクトリ名と完全に一致させます。ブリーフの能力、肯定的なトリガー、必要な否定的曖昧さ解消を 1 つの `description` に圧縮し、入力の詳細、完全な出力要件、実行上の禁止事項は本文に書きます。
<!-- rubric -->
- ファイル名が `SKILL.md` で、frontmatter から始まっている。
- `name` が小文字の英数字とハイフンのみで、親ディレクトリ名と一致している。
- `description` が何をするか、いつトリガーするか、そして本当に必要な否定的曖昧さ解消を述べている。
- 本文に少なくとも入力の詳細、完全な出力要件、実行上の禁止事項が書かれている。
<!-- answer -->
合格回答は、合法な複数行 frontmatter から始まります。

```markdown
---
name: release-notes
description: Turns ... Use when ...
---
```

その後に Markdown の Instructions を書きます。よくある間違いは、ディレクトリが `ReleaseNotes` なのに `name` を `release-notes` と書くことです。オープン仕様は両者の一致を要求します。
<!-- hint -->
まず frontmatter の最初の 3 行だけをチェックし、本文の美化は後にしてください。
<!-- hint -->
description が書けなければ、前の講の「トリガー」と「出力」の 2 行をそのまま 1 文の短い説明にまとめてください。

### Level 2（発展）

同じ Skill について代表的なユーザーリクエストを 3 つ書き、あなたの `description` が誤トリガーやトリガー漏れを起こさないかチェックしてください。少なくとも 1 つは、トリガーされるべきでない隣接タスクにします。

進め方：練習用ディレクトリに `trigger-cases.md` の下書きを作り、「トリガーされるべき 1」「トリガーされるべき 2」「トリガーされるべきでない 1」を列挙します。`description` 中のキーワードと境界を 1 件ずつ照合します。
<!-- rubric -->
- 3 件のリクエストがすべて、実際にあり得るユーザーの言い方になっている。
- トリガーされるべきリクエストの少なくとも 2 件が、description 内の対応するキーワードや意味に合致する。
- トリガーされるべきでないリクエストが `description` の範囲語で除外でき、本文にも対応する禁止動作がある。
<!-- answer -->
`release-notes` を例にすると、「これらの PR からリリースノートを書いて」はトリガーされるべきです。「changelog をユーザーに分かる版に直して」もトリガーされるべきです。「Git tag を打って本番にリリースして」はトリガーされるべきではありません。`description` が「Helps with releases」だけなら、3 件目を誤判定しがちです。範囲を「write release notes」に絞り、「Do not use for tagging, deployment, or publishing operations」を明記してください。本文には「tag を作らない、リリースを実行しない」と書き、Skill がすでに読み込まれた場合や、ユーザーが混合タスクを出した場合の実行を縛ります。
<!-- hint -->
リクエストはユーザーが本当に言いそうな言葉で書き、仕様フィールドのような書き方にしないでください。
<!-- hint -->
隣接タスクには「送信、公開、デプロイ、元ファイルの変更、優先度の決定」といった動作が含まれがちです。
<!-- /exercises -->

## 持ち帰り：メタデータの二つの役割

最小限の `SKILL.md` には今や二つの役割があります。frontmatter は発見と選択を担い、本文は実際の実行を担います。入口が機能し始めると、次は資料がどんどん長くなるという問題が出てきます。次のステップでは、Agent がタスクに必要なときだけタグ、例、テンプレートを読むようにします。
