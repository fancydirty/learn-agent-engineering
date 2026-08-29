# 参考ソース

このコースの重要な主張は、すべて以下のソースに基づいています。本文では `[^Sn]` の形で引用し、該当する抜粋を各エントリの下に掲載しています。引用はすべて 2026-08-26 に最終ページ（リダイレクト後の URL を含む）から一字ずつ照合しており、原文のカーリークォートやダッシュをそのまま保持し、一切の言い換えを加えていません。

執筆規律（全レッスンに適用）:
- 引用は、引用文の中に実在する主張だけを裏づけます。引用に現れない数値・しきい値・順位づけに `[^Sn]` を付けてはいけません。
- 「リグレッションテストのベースライン / CI での評価実行 / スコアドリフトの検出」について一次資料を持つソースはありません。エンジニアリングの常識として記述することはできますが、引用を付けたり Anthropic 由来と主張したりしてはいけません。
- 「評価セットがどれだけの規模を必要とするか」の数値的なしきい値を示すソースはありません。捏造してはいけません。
- コンパイラや静的型チェッカーを検証器として列挙しているソースはありません。Anthropic に帰属させてはいけません。
- S4 は継続的に更新される公式ドキュメントのページです（2025 年のブログ記事からリダイレクトされ、内容は書き換えられています）。引用する際は「Claude Code 公式ドキュメント」と呼び、公開日を特定してはいけません。

## S1 — Building Effective AI Agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/building-effective-agents

- authority: authoritative-guide

エージェントのパターンを扱う Anthropic の権威ある記事です（2024-12）。ページ冒頭にはツールエコシステムの記述が古くなっている旨の一次情報バナーがありますが、本コースが引くのは評価と信頼に関する原則的な主張だけです。自律性は誤りの累積を招くためサンドボックスでのテストとガードレールが必要であること、各ステップで環境からグラウンドトゥルースのフィードバックを得る必要があること、計測可能な改善が正当化するときにだけ複雑さを足す価値があること、コードは自動テストで検証できるが人間のレビューは依然として不可欠であること、そして「作る側」と「チェックする側」を分けたほうがうまくいくことです。

引用:
> "The autonomous nature of agents means higher costs, and the potential for compounding errors. We recommend extensive testing in sandboxed environments, along with the appropriate guardrails."
> "During execution, it's crucial for the agents to gain “ground truth” from the environment at each step (such as tool call results or code execution) to assess its progress."
> "Agents can then pause for human feedback at checkpoints or when encountering blockers."
> "The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making."
> "The key to success, as with any LLM features, is measuring performance and iterating on implementations. To repeat: you should consider adding complexity only when it demonstrably improves outcomes."
> "Start with simple prompts, optimize them with comprehensive evaluation, and add multi-step agentic systems only when simpler solutions fall short."
> "Both applications illustrate how agents add the most value for tasks that require both conversation and action, have clear success criteria, enable feedback loops, and integrate meaningful human oversight."
> "Code solutions are verifiable through automated tests;"
> "Agents can iterate on solutions using test results as feedback;"
> "However, whereas automated testing helps verify functionality, human review remains crucial for ensuring solutions align with broader system requirements."
> "Implementing guardrails where one model instance processes user queries while another screens them for inappropriate content or requests. This tends to perform better than having the same LLM call handle both guardrails and the core response."
> "Automating evals for evaluating LLM performance, where each LLM call evaluates a different aspect of the model’s performance on a given prompt."
> "This workflow is particularly effective when we have clear evaluation criteria, and when iterative refinement provides measurable value. The two signs of good fit are, first, that LLM responses can be demonstrably improved when a human articulates their feedback; and second, that the LLM can provide such feedback."
> "Evaluating whether a given piece of content is inappropriate, with multiple prompts evaluating different aspects or requiring different vote thresholds to balance false positives and negatives."
> "Test how the model uses your tools: Run many example inputs in our workbench to see what mistakes the model makes, and iterate."
> "To fix this, we changed the tool to always require absolute filepaths—and we found that the model used this method flawlessly."
> "Agentic systems often trade latency and cost for better task performance, and you should consider when this tradeoff makes sense."

## S2 — How we built our multi-agent research system — Anthropic Engineering

URL: https://www.anthropic.com/engineering/multi-agent-research-system

- authority: authoritative-guide

マルチエージェントのリサーチシステムに関する Anthropic のエンジニアリング振り返りです（2025-06）。本コースの中核となるソースです。従来のテストは「同じ入力なら同じ経路をたどる」と仮定しますが、エージェントはこの仮定を満たしません。ステップごとのチェックではなく最終状態を評価する必要があります。実際のクエリ 20 件程度から始める評価セットが有効で、効果量が大きければ数件のテストケースでも差は見えます。自由形式のテキストにはルーブリックに基づく LLM ジャッジを使います（単一の呼び出しで 0.0〜1.0 のスコアと pass/fail を出す形が最も安定します）。自動評価が取り逃がすエッジケースは、手動テストで捕まえる必要があります。

引用:
> "Good evaluations are essential for building reliable AI applications, and agents are no different. However, evaluating multi-agent systems presents unique challenges."
> "Traditional evaluations often assume that the AI follows the same steps each time: given input X, the system should follow path Y to produce output Z. But multi-agent systems don't work this way."
> "Even with identical starting points, agents might take completely different valid paths to reach their goal. One agent might search three sources while another searches ten, or they might use different tools to find the same answer."
> "Because we don’t always know what the right steps are, we usually can't just check if agents followed the “correct” steps we prescribed in advance. Instead, we need flexible evaluation methods that judge whether agents achieved the right outcomes while also following a reasonable process."
> "We found success focusing on end-state evaluation rather than turn-by-turn analysis. Instead of judging whether the agent followed a specific process, evaluate whether it achieved the correct final state."
> "This approach acknowledges that agents may find alternative paths to the same goal while still ensuring they deliver the intended outcome. For complex workflows, break evaluation into discrete checkpoints where specific state changes should have occurred, rather than attempting to validate every intermediate step."
> "In early agent development, changes tend to have dramatic impacts because there is abundant low-hanging fruit. A prompt tweak might boost success rates from 30% to 80%. With effect sizes this large, you can spot changes with just a few test cases."
> "We started with a set of about 20 queries representing real usage patterns."
> "We often hear that AI developer teams delay creating evals because they believe that only large evals with hundreds of test cases are useful. However, it’s best to start with small-scale testing right away with a few examples, rather than delaying until you can build more thorough evals."
> "Research outputs are difficult to evaluate programmatically, since they are free-form text and rarely have a single correct answer. LLMs are a natural fit for grading outputs."
> "We used an LLM judge that evaluated each output against criteria in a rubric: factual accuracy (do claims match sources?), citation accuracy (do the cited sources match the claims?), completeness (are all requested aspects covered?), source quality (did it use primary sources over lower-quality secondary sources?), and tool efficiency (did it use the right tools a reasonable number of times?)."
> "We experimented with multiple judges to evaluate each component, but found that a single LLM call with a single prompt outputting scores from 0.0-1.0 and a pass-fail grade was the most consistent and aligned with human judgements."
> "People testing agents find edge cases that evals miss. These include hallucinated answers on unusual queries, system failures, or subtle source selection biases."
> "In our case, human testers noticed that our early agents consistently chose SEO-optimized content farms over authoritative but less highly-ranked sources like academic PDFs or personal blogs."
> "Even in a world of automated evaluations, manual testing remains essential."
> "In traditional software, a bug might break a feature, degrade performance, or cause outages. In agentic systems, minor changes cascade into large behavioral changes, which makes it remarkably difficult to write code for complex agents that must maintain state in a long-running process."
> "The compound nature of errors in agentic systems means that minor issues for traditional software can derail agents entirely. One step failing can cause agents to explore entirely different trajectories, leading to unpredictable outcomes."
> "Agents make dynamic decisions and are non-deterministic between runs, even with identical prompts. This makes debugging harder."
> "Adding full production tracing let us diagnose why agents failed and fix issues systematically."
> "We combine the adaptability of AI agents built on Claude with deterministic safeguards like retry logic and regular checkpoints."

## S3 — Writing effective tools for agents — with agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/writing-tools-for-agents

- authority: authoritative-guide

ツールエンジニアリングに関する Anthropic の記事です（2025-09）。本コースは「評価トラックをどう立てるか」についての一次的な実践をここから引いています。決定的なシステムと非決定的なエージェントという定義上の対比、評価タスクは実際の利用に根ざし十分な複雑さを持つべきこと、評価のプロンプトごとに検証可能な結果を対にすべきで、検証器は「文字列の完全一致」から「Claude をジャッジにする」までのスペクトラム上にあること、評価は「1 タスクにつき 1 つのエージェンティック while ループ」でプログラム的に実行すること、合格率以外にも実行時間・呼び出し回数・トークン消費・ツールエラーといったメトリクスを集めること、そして過学習を防ぐためにホールドアウトセットを使うことです。

引用:
> "In computing, deterministic systems produce the same output every time given identical inputs, while non-deterministic systems—like agents—can generate varied responses even with the same starting conditions."
> "Tools are a new kind of software which reflects a contract between deterministic systems and non-deterministic agents."
> "Building an evaluation allows you to systematically measure the performance of your tools."
> "Start by standing up a quick prototype of your tools and testing them locally. Next, run a comprehensive evaluation to measure subsequent changes."
> "Next, you need to measure how well Claude uses your tools by running an evaluation. Start by generating lots of evaluation tasks, grounded in real world uses."
> "We recommend you avoid overly simplistic or superficial “sandbox” environments that don’t stress-test your tools with sufficient complexity. Strong evaluation tasks might require multiple tool calls—potentially dozens."
> "Each evaluation prompt should be paired with a verifiable response or outcome. Your verifier can be as simple as an exact string comparison between ground truth and sampled responses, or as advanced as enlisting Claude to judge the response."
> "Avoid overly strict verifiers that reject correct responses due to spurious differences like formatting, punctuation, or valid alternative phrasings."
> "For each prompt-response pair, you can optionally also specify the tools you expect an agent to call in solving the task, to measure whether or not agents are successful in grasping each tool’s purpose during evaluation."
> "However, because there might be multiple valid paths to solving tasks correctly, try to avoid overspecifying or overfitting to strategies."
> "We recommend running your evaluation programmatically with direct LLM API calls. Use simple agentic loops (while-loops wrapping alternating LLM API and tool calls): one loop for each evaluation task."
> "As well as top-level accuracy, we recommend collecting other metrics like the total runtime of individual tool calls and tasks, the total number of tool calls, the total token consumption, and tool errors."
> "However, keep in mind that what agents omit in their feedback and responses can often be more important than what they include. LLMs don’t always say what they mean."
> "Review the raw transcripts (including tool calls and tool responses) to catch any behavior not explicitly described in the agent’s CoT."
> "Lots of redundant tool calls might suggest some rightsizing of pagination or token limit parameters is warranted; lots of tool errors for invalid parameters might suggest tools could use clearer descriptions or better examples."
> "We relied on held-out test sets to ensure we did not overfit to our “training” evaluations."
> "With your evaluation you can measure the impact of your prompt engineering with greater confidence. Even small refinements to tool descriptions can yield dramatic improvements."

## S4 — Best practices for Claude Code — Claude Code official documentation

URL: https://code.claude.com/docs/en/best-practices

- authority: official-docs

Claude Code の公式ベストプラクティスドキュメントです（継続的に更新される生きたページで、以前のブログ記事からリダイレクトされています。引用の際に日付は付けません）。本コースはここから「エージェント自身が実行できるチェックを与える」という本筋を引いています。実行できるチェックがなければ「完了に見える」が唯一のシグナルになり、あなた自身が検証ループになってしまいます。pass/fail のシグナルがあればループは自分で閉じます。チェックはテスト、ビルドの終了コード、リンター、ベースラインとの差分を取るスクリプト、スクリーンショットの比較などです。作業をしたモデル自身に採点させるべきではありません。不足を探せと言われたレビュアーは必ず何かを見つけるので、「正しさに影響する問題だけを報告する」に制約します。

引用:
> "Give Claude a check it can run: tests, a build, a screenshot to compare. It's the difference between a session you watch and one you walk away from."
> "Claude stops when the work looks done. Without a check it can run, \"looks done\" is the only signal available, and you become the verification loop: every mistake waits for you to notice it."
> "Give Claude something that produces a pass or fail, and the loop closes on its own. Claude does the work, runs the check, reads the result, and iterates until the check passes."
> "The check is anything that returns a signal Claude can read in the conversation: a test suite, a build exit code, a linter, a script that diffs output against a fixture, or a browser screenshot compared against a design."
> "By a second opinion: a verification subagent or a dynamic workflow that checks its own findings has a fresh model try to refute the result, so the agent doing the work isn't the one grading it."
> "Each step trades setup for attention. The prompt version works on any task today. The /goal and Stop hook versions are what let an unattended run finish correctly without you."
> "Have Claude show evidence rather than asserting success: the test output, the command it ran and what it returned, or a screenshot of the result. Reviewing evidence is faster than re-running the verification yourself, and it works for sessions you weren't watching."
> "The longer Claude works unattended, the more an independent check matters before you count the work as done. A reviewer running in a fresh subagent context sees only the diff and the criteria you give it, not the reasoning that produced the change, so it evaluates the result on its own terms."
> "A reviewer prompted to find gaps will usually report some, even when the work is sound, because that is what it was asked to do. Chasing every finding leads to over-engineering: extra abstraction layers, defensive code, and tests for cases that can't happen."
> "Tell the reviewer to flag only gaps that affect correctness or the stated requirements, and treat the rest as optional."
> "The trust-then-verify gap. Claude produces a plausible-looking implementation that doesn't handle edge cases."
> "Fix: Always provide verification (tests, scripts, screenshots). If you can't verify it, don't ship it."

## S5 — Define success criteria and build evaluations — Claude API documentation

URL: https://platform.claude.com/docs/en/test-and-evaluate/develop-tests

- authority: official-docs

Claude 開発者プラットフォームの「テストと評価」の公式ドキュメントです（かつて「成功基準の定義」「テストの構築」「評価ツール」に分かれていたページは、この 1 ページに統合されています。読者を別の評価ツールのページに探しに行かせないでください）。成功基準に求められる計測可能性を完全な例つきで示し、評価設計の 3 原則（実際の分布に合わせる、可能な限り採点を自動化する、ケースごとの質より量を優先する）、4 つの採点方法のトレードオフの順序（コードベースの採点が最も速く最も信頼できる、LLM ベースの採点は速く柔軟だがまずジャッジの妥当性を検証する必要がある、人間による採点は最も柔軟だが遅くコストが高く可能なら避ける）、そしてジャッジのプロンプト技法（出力形式を制約する、採点の前に推論させる）を提供しています。

引用:
> "Building a successful LLM-based application starts with clearly defining your success criteria and then designing evaluations to measure performance against them. This cycle is central to prompt engineering."
> "Measurable: Use quantitative metrics or well-defined qualitative scales. Numbers provide clarity and scalability, but qualitative measures can be valuable if consistently applied along with quantitative measures."
> "Achievable: Base your targets on industry benchmarks, prior experiments, AI research, or expert knowledge. Your success metrics should not be unrealistic to current frontier model capabilities."
> "Most use cases need multidimensional evaluation along several success criteria."
> "The sentiment analysis model should achieve an F1 score of at least 0.85 (Measurable, Specific) on a held-out test set* of 10,000 diverse Twitter posts (Relevant), which is a 5% improvement over the current baseline (Achievable)."
> "Be task-specific: Design evals that mirror your real-world task distribution. Don't forget to factor in edge cases!"
> "Automate when possible: Structure questions to allow for automated grading (for example, multiple-choice, string match, code-graded, LLM-graded)."
> "Prioritize volume over quality: More questions with slightly lower signal automated grading is better than fewer questions with high-quality human hand-graded evals."
> "Ambiguous test cases where even humans would find it hard to reach an assessment consensus"
> "When deciding which method to use to grade evals, choose the fastest, most reliable, most scalable method:"
> "Code-based grading: Fastest and most reliable, extremely scalable, but also lacks nuance for more complex judgments that require less rule-based rigidity."
> "Exact match: output == golden_answer"
> "Exact match evals measure whether the model's output matches a predefined correct answer, typically after normalizing whitespace and case. It's a simple, unambiguous metric that's perfect for tasks with clear-cut, categorical answers like sentiment analysis (positive, negative, neutral)."
> "LLM-based grading: Fast and flexible, scalable and suitable for complex judgment. Test to ensure reliability first then scale."
> "Human grading: Most flexible and high quality, but slow and expensive. Avoid if possible."
> "A given use case, or even a specific success criteria for that use case, might require several rubrics for holistic evaluation."
> "Empirical or specific: For example, instruct the LLM to output only 'correct' or 'incorrect', or to judge from a scale of 1–5. Purely qualitative evaluations are hard to assess quickly and at scale."
> "Encourage reasoning: Ask the LLM to reason first before producing an evaluation score, and then discard the reasoning. This increases evaluation performance, particularly for tasks requiring complex judgment."
> "The LLM-based Likert scale is a psychometric scale that uses an LLM to judge subjective attitudes or perceptions."

## S6 — Tool use with Claude — Claude API documentation

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview

- authority: official-docs

ツール呼び出しに関する公式ドキュメントです。本コースが取り出すのは 2 点だけです。`strict: true` は API のレイヤーでツール呼び出しがスキーマに厳密に従うことを保証します（ある種の検証をプラットフォームの保証として前倒しします）。そして「モデルは欠けているパラメータを自分から尋ねる」といった理想的な振る舞いを、公式ドキュメントは明示的に保証していません。保証されていない振る舞いこそ、評価セットがカバーすべきものです。

引用:
> "Add strict: true to your custom tool definitions to ensure Claude's tool calls always match your schema exactly."
> "Claude responds with stop_reason: \"tool_use\" and one or more tool_use blocks. Your code executes the operation and sends back a tool_result."
> "If the user's prompt doesn't include enough information to fill all the required parameters for a tool, Claude Opus is much more likely to recognize that a parameter is missing and ask for it."
> "This behavior is not guaranteed, especially for more ambiguous prompts and for less capable models."
