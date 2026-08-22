# 第6回：ワークフローからデリバラブルな Skill へ

> 本講の目標：
> - `SKILL.md`、参考ファイル、テンプレートまたはスクリプト境界の説明を含む、完全な Skill フォルダーを組み立てます。
> - 仕様検証ツールまたは手動同等チェックで、入口ファイルが有効であることを確認します。
> - 自分の Agent で 3 件の代表的テストを実行し、失敗を記録して修正します。
>
> 前提条件：トリガーテストのマトリクスとセキュリティ監査が完成していること | 前の講 [<< 05](./05-testing-and-safety.md) | 次のページ [コース目次 >>](./README.md)

## 成果物は再確認できる一組のファイル

ここまでで、`SKILL.md`、リソースのレイヤー分け、実行境界、トリガーテスト、セキュリティ監査がそろいました。最後のステップは、これらを、他の人がチェックでき、Agent が読め、あなた自身が再テストできるフォルダーに入れることです。

この講の終点は具体的です。完全な Skill フォルダー 1 つ。少なくとも入口ファイル、`references/` ファイル 1 つ、テンプレートまたはスクリプト境界の説明、そして 3 件の代表的テスト記録を含みます。この終点に実行可能なコードは不要です。

## 解説

### 完全なフォルダーはまず形を見る

オープン仕様は Skill を、少なくとも `SKILL.md` を含むディレクトリと定義し、一般的な任意コンテンツのために `scripts/`、`references/`、`assets/` で整理する約定を設けています。OpenAI の現在のガイドも同じディレクトリ形状を採用しています。[^S2][^S4]

このコースでは、初学者に適した最小の引き渡し形状を使います。

```text
release-notes/
  SKILL.md
  references/
    release-style.md
  assets/
    release-notes-template.md
  tests/
    trigger-tests.md
  safety-audit.md
```

`SKILL.md` が入口です。`references/release-style.md` にスタイルと境界の詳細を置きます。`assets/release-notes-template.md` に固定の出力スケルトンを置きます。`tests/trigger-tests.md` に 3 件の代表的テストを置きます。`safety-audit.md` にどのリスクをチェックしたかを記録します。

ここには混同しやすい境界が 1 つあります。`tests/` と `safety-audit.md` はこのコース独自の QA 記録であり、仕様が約定する自動発見ディレクトリではありません。フォルダーに残すのは、次のメンテナーがテストと修正の過程を見られるようにするためです。

### 検証は 2 層：仕様チェックと手動同等チェック

`skills-ref` リポジトリの説明どおりに参考ライブラリをインストール済みで、現在の仮想環境でコマンドが見つかるなら、それで `SKILL.md` の frontmatter と命名制約をチェックできます。このライブラリはデモ用途と明記されているため、このコースは常に手動同等チェックを残します。[^S2][^S6]

```text
1. フォルダー名が frontmatter の name と完全に一致する。
2. SKILL.md が 1 行目から --- で始まる。
3. frontmatter が YAML として読める。
4. name が小文字の英数字とハイフンのみ。ハイフンで始まらず終わらず、連続ハイフンがない。
5. description が空でなく、何をするかといつ使うかを述べている。
6. 本文が実在する `references/` や `assets/` への相対パスを指せる。
```

検証は Skill が使いやすいことを証明しません。入口ファイルに低レベルの構造エラーがないことだけを証明します。本当に使いやすいかどうかは、3 件の代表的テストにかかっています。

### 3 件のテストは自分の Agent で実行する

ChatGPT と Codex は明示的呼び出しと暗黙的呼び出しをサポートします。暗黙的呼び出しは、タスクが `description` にマッチするかで決まります。Anthropic の現在のガイドも、まずメタデータを見てから全文を読む発見プロセスを採用しています。[^S4][^S7] テスト前に対象クライアントの現在のドキュメントに従って Skill をインストールし、スキル一覧か明示的呼び出しで見えることを確認してから、各ケースごとに新しいセッションで暗黙的トリガーをテストします。クライアントが呼び出し記録を表示しない場合、出力が似ていることは結果が似ていることしか示さず、トリガーが発生した証拠には単独ではなりません。

各テストは 4 項目を記録します。

```text
Prompt: ユーザーリクエストの原文
Expected: should trigger / should not trigger
Observed: Agent が実際にやったこと
Revision: description、本文、リソース、テスト自体のどれを変えるか
```

Skill が見えることを確認済みなのに Agent がトリガーしなかった場合、`description` をいきなり長いリストに変えないでください。まず、欠けているのがトリガー語なのか、入力語なのか、出力語なのか、それとも否定的曖昧さ解消が広すぎるのかを見ます。修正後は新しいセッションで同じテストを再実行します。

### 失敗記録は成果物の一部

デリバラブルな Skill は失敗を隠すべきではありません。Anthropic は代表的なタスクで別の新しいセッションが Skill をどう使うかを観察し、実際の結果に基づいて修正することを勧めています。[^S1][^S7] したがって `tests/trigger-tests.md` には失敗記録と修正記録を残すべきです。

推奨フォーマット：

```markdown
| id | expected | observed | revision |
|---|---|---|---|
| T1 | should trigger | triggered and used template | no change |
| T2 | should trigger | did not trigger on "customer-facing changelog" | add "customer-facing changelog" to description |
| T3 | should not trigger | offered to create Git tag | add "Do not create Git tags" to Instructions |
```

この記録は Skill を「一度書ききり」から「保守可能」に進めます。次にあなた自身や別の Agent が引き継ぐとき、なぜある文がそこに書かれているのかが分かります。

## 完全な例：リリースノート Skill フォルダー

次は完全ですが非常に小さな `release-notes` Skill です。スクリプトは不要で、参考ファイルとテンプレートだけを使います。

```text
release-notes/
  SKILL.md
  references/
    release-style.md
  assets/
    release-notes-template.md
  tests/
    trigger-tests.md
  safety-audit.md
```

`SKILL.md`：

```markdown
---
name: release-notes
description: Turns commits, PR summaries, customer-facing changelog drafts, or change lists into user-facing Markdown release notes. Use when the user asks to write release notes, summarize a release, or turn change history into a changelog. Do not use for tagging, deployment, or publishing operations.
---

# Release Notes

## Instructions

Use this skill when the user asks for user-facing release notes from commits, PR summaries, changelog drafts, or change lists.

Read references/release-style.md before writing if the user asks for house style, audience tone, or wording rules.

Use assets/release-notes-template.md for the output structure unless the user provides a different structure.

Return Markdown grouped by Added, Fixed, Changed, and Known issues. Preserve the facts in the input. Mark missing facts as open questions instead of inventing them.

Do not modify source code, create Git tags, deploy, publish, send announcements, or expose private customer data.
```

`references/release-style.md`：

```markdown
# Release style

- Write for product users, not internal engineers.
- Keep each bullet under 25 words when possible.
- Start each bullet with the user-visible change.
- Avoid commit hashes unless the user asks for an engineering changelog.
- If a change affects privacy, reliability, or data loss, keep the warning explicit.
```

`assets/release-notes-template.md`：

```markdown
# Release notes

## Added

- 

## Changed

- 

## Fixed

- 

## Known issues

- 

## Open questions

- 
```

`tests/trigger-tests.md`：

```markdown
| id | prompt | expected | observed | revision |
|---|---|---|---|---|
| T1 | これらの PR 要約からリリースノートを書いて。 | should trigger | pending | pending |
| T2 | customer-facing changelog の下書きを、より分かりやすい release notes に直して。 | should trigger | pending | pending |
| T3 | tag を打ってバージョンを公開し、それから告知を書いて。 | should not take over full task | pending | pending |
```

`safety-audit.md`：

```markdown
# Safety audit

- Files: reads only user-provided change material, references/release-style.md, and assets/release-notes-template.md.
- Writes: produces draft Markdown in the conversation unless the user explicitly asks for a file path.
- Secrets: does not request deployment credentials, API keys, private customer lists, or unreleased financial data.
- Network: no network access required.
- Scripts: no executable script included; formatting is instruction-only.
```

引き渡し時はまず構造を検証します。仕様検証ツールをインストール済みならその説明に従ってチェックし、なければ前掲の 6 条の手動チェックを 1 項目ずつ照合します。次に Skill を対象の Agent が読める場所に置き、スキル一覧か明示的呼び出しで見えることを確認し、T1、T2、T3 の 3 件のリクエストをそれぞれ新しいセッションでテストして、前のテストが次の判断を汚染するのを避けます。クライアントが呼び出し記録を提供しない場合は、「出力がルールに合う」ことを結果の証拠として記録し、トリガーの証拠としては書かないでください。

## あなたの番：競合調査 Skill の半完成品

次の 2 か所を完成させてください。`description` はいつトリガーするかを説明し、`references/research-boundaries.md` は安全境界を 1 つ遮断します。

```text
competitor-research/
  SKILL.md
  references/
    research-boundaries.md
  assets/
    competitor-brief-template.md
  tests/
    trigger-tests.md
  safety-audit.md
```

半完成の `SKILL.md`：

```markdown
---
name: competitor-research
description: ________________________________________
---

# Competitor Research

## Instructions

Use this skill to turn user-provided competitor notes, public website excerpts, or product comparison notes into a structured competitor brief.

Read references/research-boundaries.md before writing the brief.

Use assets/competitor-brief-template.md for the output structure.
```

半完成の `references/research-boundaries.md`：

```markdown
# Research boundaries

- Use only sources or excerpts the user provides in the task.
- ________________________________________
- Mark unsupported claims as "unverified" instead of presenting them as fact.
```

参考回答：

```yaml
description: Turns user-provided competitor notes, public website excerpts, or product comparison notes into a structured competitor brief. Use when the user asks to summarize competitors, compare positioning, or prepare competitor research from supplied material. Do not use for scraping, private-data collection, or claims without sources.
```

```markdown
- Do not collect private employee, customer, or account data; ask the user to provide public, sourceable material instead.
```

この途中までの例の要点は、調査系の Skill を作る場合でも、「調査」を無制限の権限として書かないことです。入力ソースと未検証の主張の両方に境界が必要です。

```agentmentor-action
mode: reasoning_audit
label: 最終 Skill フォルダーを監査する
description: SKILL.md、参考ファイル、テンプレートまたはスクリプト境界、3 件のテスト、セキュリティ監査が互いに矛盾していないか、この講の終点に沿って Agent にチェックさせます。
purpose: Skill フォルダーを書き終えました。このコースの終点を満たしているかチェックし、description、リソースパス、トリガーテスト、セキュリティ境界の間の矛盾を指摘してください。
rules:
  - 一度にチェックするリスク領域は 1 つだけにする：構造、トリガー、出力、安全、テスト記録。
  - 私が提供した具体的なファイル断片を引用し、Agent Skills の概念を抽象的に繰り返さない。
  - 各問題に対して、直接編集可能な修正提案を 1 つ示す。
```

<!-- exercises -->
## 演習

### Level 1（ウォームアップ）

練習用ディレクトリで最終的な Skill フォルダーを組み立ててください。`SKILL.md`、`references/` ファイル 1 つ、テンプレートファイルまたはスクリプト境界の説明、`tests/trigger-tests.md`、`safety-audit.md` を必ず含めます。

進め方：まずファイルツリーを描き、次に空ファイルを 1 つずつ作成し、最後に前の講で作ったブリーフ、リソース説明、テストマトリクス、セキュリティ監査を対応する場所に移します。プライベートな元データは置かないでください。
<!-- rubric -->
- ファイルツリーに少なくとも 5 つの成果物（入口、参考、テンプレートまたはスクリプト境界、テスト、セキュリティ監査）が含まれる。
- `SKILL.md` が参照する相対パスがフォルダー内に実在する。
- Skill がこのコースページや隠れたコンテキストに依存せず、フォルダーだけをコピーしても読み通せる。
<!-- answer -->
合格する成果物の例：`my-skill/SKILL.md`、`my-skill/references/format.md`、`my-skill/assets/output-template.md`、`my-skill/tests/trigger-tests.md`、`my-skill/safety-audit.md`。テンプレートを書かない選択をした場合でも、明確なスクリプト境界の説明を書きます。たとえば `scripts/README.md` に「スクリプトは含まない。将来スクリプトを追加する場合は、依存関係、入力、出力、失敗時のメッセージを必ず説明する」と書きます。
<!-- hint -->
まず `SKILL.md` が参照するのは参考ファイル 1 つとテンプレート 1 つだけにして、パスの間違いを減らしてください。
<!-- hint -->
フォルダーをコピーして別の Agent に読ませられないなら、一部の説明がまだあなたの会話の中に隠れているということです。

### Level 2（発展）

最終的な Skill に対して検証 1 回と代表的テスト 3 件を実行してください。公式リポジトリの説明どおりに `skills-ref` をインストールして有効化済みなら `skills-ref validate ./your-skill` を実行できます。そうでなければ、この講の 6 条の手動同等チェックを実行します。次に自分の Agent で 3 件のテストを実行し、observed と revision を `tests/trigger-tests.md` に書き戻します。

進め方：Skill の親ディレクトリで検証または手動チェックを実行します。対象クライアントに Skill がインストールされ一覧に出ることを確認してから、3 件のテストをそれぞれ別の新しいセッションで Agent に送ります。トリガーしたか、何を読んだか、何を出力したか、越境したかを観察し、結果をそのまま記録します。
<!-- rubric -->
- 検証結果または手動チェック 6 項目のすべてに記録がある。
- 3 件のテストすべてに `expected`、`observed`、`revision` がある。
- 少なくとも 1 件のテスト記録に「変更不要」または「ある 1 行を修正済み」が書かれており、すべて空欄ではない。
- テストが失敗した場合、修正箇所が `description`、本文、参考ファイル、テンプレート、テストケースのどれかに特定されている。
<!-- answer -->
合格記録の例：`T2 expected should trigger; observed did not trigger on "customer-facing changelog"; revision added "customer-facing changelog" to description.` もう 1 件の例：`T3 expected should not take over full task; observed offered to tag release; revision added "Do not create Git tags or publish versions" to Instructions.` 記録はなぜその文を変えたのかを説明できる必要があり、「description を調整」とだけ書くのでは不十分です。
<!-- hint -->
Agent が明らかに Skill をトリガーしなかった場合は、まず description にユーザーの言い方にあるタスク語が含まれているかをチェックしてください。
<!-- hint -->
Agent がトリガー後に越境した場合は、まず本文の禁止動作を直してください。そもそもトリガーされるべきでない場合は、description の範囲語を直します。
<!-- /exercises -->

## コースの終点、保守の起点

これでこのコースの終点タスクは完了です。繰り返しのワークフローを完全な Skill フォルダーとして引き渡し、3 件の代表的リクエストでトリガー、出力、境界をテストしました。今後保守するときは、失敗記録を削除しないでください。それらは Skill の変更履歴として扱います。リソース、テンプレート、スクリプトを追加するたびに、テストマトリクスとセキュリティ監査も同時に更新します。
