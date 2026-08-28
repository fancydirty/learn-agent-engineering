# レッスン2: Skill の解剖学: SKILL.md ファイル

> 学習目標:
> - SKILL.md の 2 部構成を理解する
> - YAML フロントマターの必須フィールドを把握する
> - 実際に機能する description の書き方を学ぶ
> - instructions セクションの組み立て方を理解する
>
> 前提: [<< レッスン1](./01-what-are-skills.md) | 次: [レッスン3 >>](./03-first-skill.md)

## Skill ファイルの見た目

どの Skill を開いても、同じ形をしています。[^S1]

```markdown
---
name: task-organizer
description: Sorts a messy to-do list into groups by priority and due date
---

# Task Organizer

Pull structured information out of a disorganized task list.

## Input format

Accept any of these:
- A plain text list
- A Markdown checklist
- A chat log with timestamps

## Steps

1. Extract the core content of each task
2. Identify the due date, if there is one
3. Judge priority (urgent / important / normal)
4. Sort by due date, soonest first

## Output format

### 🔴 Urgent (due today or tomorrow)
- [task] - due time

### 🟡 Important (due this week)
- [task] - due time

### ⚪ Normal (no clear deadline, or further out)
- [task]
```

**このファイルは 2 つの部分でできています。**

1. **YAML フロントマター**（`---` マーカーで挟まれた部分すべて）: この Skill の基本情報を Claude に伝えるメタデータ
2. **Markdown の instructions**（それ以降すべて）: Claude が何をすべきかを伝える実際の指示

## YAML フロントマター: Claude があなたの Skill を見つける仕組み

フロントマターは、ファイルの一番上にある `---` で囲まれたブロックです。ここでは、最も重要な 2 つのことを Claude に伝えます。[^S3][^S4]

### name: Skill の一意な識別子

```yaml
name: task-organizer
```

- **ルール**: 小文字、数字、ハイフンのみ。スペースは使えません。
- **役割**: name はそのまま `/task-organizer` のようなコマンドになります。
- **アドバイス**: 説明的で、短く、一目で意味がわかる名前にしましょう。

**良い名前:**
- `meeting-notes`
- `code-review`
- `changelog-generator`

**悪い名前:**
- `my-skill-1`（何も伝わらない）
- `super_amazing_task_helper`（長すぎるうえ、アンダースコアは使えない）
- `taskOrganizer`（camelCase — 小文字とハイフンにする必要がある）

### description: 最も重要なフィールド

```yaml
description: Sorts a messy to-do list into groups by priority and due date
```

**この 1 文が、次の 3 つを決めます。**[^S6]

1. **Claude がこの Skill を自動的に読み込むかどうか**
2. **ユーザーが Skill 一覧で目にする内容**
3. **Claude がこの Skill を何のためのものだと理解するか**

だからこそ、ファイルの中の何よりも丁寧に書く価値があります。[^S6]

> "The description is the single most important field in your frontmatter. A bad description means your skill either never triggers or triggers on everything. The formula: What it does + When to use it + Key capabilities."

（description はフロントマターで最も重要なフィールドであり、これがまずいと Skill はまったく発動しないか、何にでも発動してしまいます。公式は「何をするか + いつ使うか + 主な機能」です。）

**良い description:**
```yaml
description: Sorts a messy to-do list into groups by priority and due date. Use it on unstructured task lists or meeting action items
```

**悪い description:**
```yaml
description: Helps with tasks  # 曖昧すぎる — いつ使えばよいか Claude にはわからない
description: A powerful task manager with intelligent priority analysis  # 宣伝文句。役に立つ情報は最後にあるか、そもそも無い
```

### 任意フィールド（ここではなくレッスン6で扱います）

- `model`: 使用するモデルを選ぶ
- `allowed-tools`: この Skill が触れられるツールを制限する
- `version`: バージョン番号

**最初の Skill には、`name` と `description` があれば十分です。**[^S4]

## Markdown の instructions: Claude にやり方を伝える

フロントマターより後ろはすべて、Claude が読んで従うために書かれています。[^S1]

**良い instructions には 3 つの共通点があります。**

### 1. 明確なセクション

見出しを使って、パートを分けます。

```markdown
## Input format
(どんな入力を受け付けるか)

## Steps
(手順を 1 ステップずつ明示する)

## Output format
(結果がどう見えるべきか)

## Edge cases
(厄介な状況をどう扱うか)
```

### 2. 具体的なステップ

**弱い書き方:**
```markdown
1. Analyze the tasks
2. Determine priority
3. Output the result
```

**強い書き方:**
```markdown
1. Read the task list, one task per line
2. Extract date keywords from the task text (today, tomorrow, Friday, 2024-01-15, and so on)
3. If a task contains "urgent", "ASAP", or "by EOD", mark it high priority
4. Sort by due date, soonest first
5. Output three groups: Urgent, Important, Normal
```

### 3. 例

出力フォーマットが重要なら、1 つ見せましょう。

```markdown
## Output format

### 🔴 Urgent
- Finish the quarterly report - tomorrow 17:00
- Fix the production bug - today

### 🟡 Important
- Review PR #234 - this Friday

### ⚪ Normal
- Update the docs
- Improve performance
```

例が 1 つあれば、Claude はどう並べればよいかを正確に把握します。説明するより見せるほうが効きます。サンプル出力 1 つは、フォーマットについての 3 段落の説明より多くの仕事をします。

```agentmentor-check
{
  "id": "skills-zh-02-description-quality",
  "label": "機能する description を見分ける",
  "prompt": "Git のコミット履歴を、顧客が読める変更履歴（changelog）に変える Skill を書きました。どちらの description が優れているでしょうか。",
  "whyHere": "description の公式（何をするか + いつ使うか + 主な機能）を学んだばかりです。曖昧な description は人間の読み手には問題なく見えるので、出荷する前に見分けられるかどうかが試されます。",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "description: A powerful and intelligent changelog tool that makes your project releases look professional and easy for anyone to read",
      "correct": false,
      "feedback": "これは指示ではなく製品ページのように読めます。「powerful」や「beautiful」は Claude にとって何の意味も持たず、発動のきっかけになる事実が一つも書かれていません — Git コミットも、顧客向けの出力も、フィルタリングもありません。使われないまま放置されるか、プロジェクトに言及しただけのあらゆるリクエストで発動してしまいます。"
    },
    {
      "id": "b",
      "text": "description: Turns Git commit history into a customer-facing changelog, filtering out internal commits and rewriting jargon in plain language",
      "correct": true,
      "feedback": "正解です。何をするか（変更履歴を作る）、何を入力に取るか（Git コミット）、主な機能（フィルタリング、専門用語の書き換え）を挙げています。「changelog」や「customer-facing」といった言葉が、リクエストと照合できる具体的な手がかりを Claude に与えます。"
    }
  ]
}
```

## 2 つの部分がどう連携するか

**フロントマターは発見の仕組み、instructions は実行のガイドです。**[^S2][^S5]

1. あなたが `/task-organizer` と入力する、あるいは単に「このタスクを整理して」と言う
2. Claude がフロントマターの `name` と `description` を読み、この Skill を読み込むか判断する
3. 読み込むなら、Claude は instructions 全体を読む
4. Claude は書かれたとおりに手順を進める
5. 出力は、instructions が指定したフォーマットに一致する

**だからこそ description が優れていなければならないのです**。Claude がこの Skill を使うかどうかを判断するとき、それが唯一の手がかりだからです。[^S6]

「タスクを手伝う」と書けば、Claude はどんな状況で使えばよいのかわかりません。「散らかった ToDo リストを優先度と期限でグループ分けする」と書けば、リクエストに含まれる「並べ替える」「ToDo」「タスク」といった言葉だけで、この Skill を呼び込むのに十分です。

## 実例: コードレビュー Skill を分解する

実際に使われている Skill を見てみましょう。

```markdown
---
name: code-review
description: Reviews code changes for team convention violations, likely bugs, and performance problems
---

# Code Review Assistant

## Review checklist

Work through each item below:

### 1. Conventions
- Do variable names follow team convention (camelCase, meaningful names)?
- Are there functions longer than 50 lines (consider splitting)?
- Is there duplicated code (DRY)?

### 2. Likely bugs
- Are there unhandled errors (try-catch, error return values)?
- Any possible null dereferences?
- Any SQL injection risk (if a database is involved)?

### 3. Performance
- Any N+1 queries?
- Any unnecessary nested loops?
- Any repeated computation that could be cached?

## Output format

For every issue, give:
- **Location**: file name + line number
- **Problem**: what specifically is wrong
- **Suggestion**: how to fix it

If nothing is wrong, output "✓ Code review passed"
```

**分解してみましょう。**

- **フロントマターの description**: 何をするか（コードをレビューする）と、何をチェックするか（規約、バグ、パフォーマンス）を述べている
- **instructions は 3 つのチェックリストに分かれている**: 規約、バグ、パフォーマンス。それぞれに見るべき具体的な項目がある
- **出力フォーマットが明示されている**: すべての問題に、場所・問題・提案を付けなければならない

このように書かれた Skill は、一発で正しく動きます。

<!-- exercises -->
## 💻 演習

### レベル1: 壊れたフロントマターを直す

このフロントマターのどこが問題で、どう直しますか。

```markdown
---
name: My Amazing Tool
description: A tool
---
```

<!-- rubric -->
- `name` の問題を指摘できた（スペース不可、小文字にする、ハイフンを使う）
- `description` の問題を指摘できた（曖昧すぎて、何をするか述べていない）
- 具体的な改善案を提示できた

<!-- answer -->
**問題点:**

1. `name` にスペースと大文字が含まれている。`my-amazing-tool` にすべきだが — それでも名前自体はまだまずい。Skill が何をするのかを何も伝えていないからだ
2. `description` が「A tool」だけ。Skill が何をするのか、いつ使えばよいのかを述べていない

**より良い版:**

```markdown
---
name: api-doc-generator
description: Generates API documentation from code comments, supporting JSDoc and Python docstring formats
---
```

<!-- hint -->
命名ルールに戻ろう: 小文字、数字、ハイフン

<!-- hint -->
description の公式に戻ろう: 何をするか + いつ使うか + 主な機能

### レベル2: 自分のケース向けにフロントマターを書く

レッスン1の演習で見つけたタスクを取り上げ、そのフロントマターを書いてみましょう。

<!-- rubric -->
- `name` が命名ルールに従っている（小文字、ハイフン、説明的）
- `description` が、何をするか・いつ使うか・主な機能をカバーしている
- `description` が 1 文に収まり、およそ 200 文字未満

<!-- answer -->
レッスン1の顧客フィードバックのタスクに基づく例です。

```markdown
---
name: feedback-classifier
description: Sorts customer feedback from Slack into bug reports, feature requests, and usage questions, tagging each with a priority. Use it for the daily feedback roundup
---
```

**なぜこれが機能するか:**
- `name` が説明的 — 見ただけで何かがわかる
- `description` が、何をするか（フィードバックを分類・整理する）、何が入るか（Slack の顧客フィードバック）、何が出るか（カテゴリと優先度）、いつ使うか（毎日のまとめ）をカバーしている

<!-- hint -->
description が良いかどうか迷ったら、こう自問しよう。リクエストのどの言葉が、Claude にこの Skill を思い浮かべさせるべきか。その言葉を description に入れよう。

<!-- /exercises -->

## まとめ

- **SKILL.md は 2 部構成**: YAML フロントマター（メタデータ）と Markdown の instructions（指示）
- **必須のフロントマターフィールド**: `name`（小文字、ハイフン、一意）と `description`（自動発動を左右する）
- **description の公式**: 何をするか + いつ使うか + 主な機能
- **良い instructions の 3 つの特徴**: 明確なセクション、具体的なステップ、作り込まれた例
- **各部分の噛み合い方**: フロントマターで Claude が Skill を見つけ、instructions で Claude がそれを実行する

次のレッスンでは、何もないところから始めて、完全な Skill を最初から最後まで書き上げます。

[>> レッスン3: 実践: 最初の Skill を書く](./03-first-skill.md)
