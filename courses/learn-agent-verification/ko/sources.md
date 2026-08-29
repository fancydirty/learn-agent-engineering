# 참고 자료

이 코스의 핵심 주장은 모두 아래 출처가 뒷받침합니다. 본문에서는 `[^Sn]` 형태로 인용하며, 구체적인 발췌문은 각 항목 아래에 실었습니다. 모든 인용문은 2026-08-26에 최종 페이지(리다이렉트 이후 URL 포함)에서 한 글자씩 대조해 확인했고, 원문의 컬리 따옴표와 대시를 그대로 보존하며 어떤 말바꿈도 하지 않았습니다.

집필 규율(모든 레슨에 적용):
- 인용은 인용문 안에 실제로 존재하는 주장만 뒷받침합니다. 인용문에 없는 숫자·임계값·순위에는 `[^Sn]` 인용을 달아서는 안 됩니다.
- '회귀 테스트 베이스라인 / CI에서 eval 실행 / 점수 드리프트 탐지'에 관한 1차 자료를 담은 출처는 없습니다. 엔지니어링 상식으로 서술할 수는 있으나, 인용을 달거나 Anthropic에서 나온 것으로 주장해서는 안 됩니다.
- '평가 세트가 얼마나 커야 하는가'에 대한 수치 임계값을 제시하는 출처는 없습니다. 지어내서는 안 됩니다.
- 컴파일러나 정적 타입 체커를 검증기로 열거한 출처는 없습니다. Anthropic에 귀속시켜서는 안 됩니다.
- S4는 계속 갱신되는 공식 문서 페이지입니다(2025년 블로그 글에서 리다이렉트되었고 내용은 다시 쓰였습니다). 인용할 때는 'Claude Code 공식 문서'라고 부르고, 발행일을 특정해서는 안 됩니다.

## S1 — Building Effective AI Agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/building-effective-agents

- authority: authoritative-guide

에이전트 패턴을 다룬 Anthropic의 권위 있는 아티클입니다(2024-12). 페이지 상단에는 도구 생태계 서술이 낡았다는 1차 저자의 배너가 붙어 있지만, 이 코스는 평가와 신뢰에 관한 원칙적 주장만 가져옵니다. 자율성은 오류를 누적시키므로 샌드박스 테스트와 가드레일이 필요하다는 점, 각 단계마다 환경에서 오는 ground truth 피드백이 있어야 한다는 점, 측정 가능한 개선이 정당화할 때만 복잡도를 더할 값어치가 있다는 점, 코드는 자동화 테스트로 검증할 수 있지만 사람의 리뷰는 여전히 필수라는 점, 그리고 '실행하는 쪽'과 '확인하는 쪽'을 분리하는 편이 더 낫다는 점입니다.

핵심 인용:
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

멀티 에이전트 리서치 시스템에 대한 Anthropic의 엔지니어링 회고로(2025-06), 이 코스의 핵심 출처입니다. 전통적인 테스트는 '같은 입력이면 같은 경로를 따른다'를 전제하지만 에이전트는 이 전제를 만족하지 않는다는 점, 단계마다 확인하기보다 종료 상태를 평가해야 한다는 점, 실제 쿼리 20개 남짓에서 시작하는 평가 세트가 효과적이며 효과 크기가 크면 테스트 케이스 몇 개만으로도 차이가 드러난다는 점, 자유 형식 텍스트는 루브릭 기반으로 채점하는 LLM 판정자를 쓴다는 점(호출 한 번에 0.0–1.0 점수와 통과/실패을 함께 내는 방식이 가장 안정적), 자동 평가가 놓치는 엣지 케이스는 수동 테스트로 잡아야 한다는 점을 다룹니다.

핵심 인용:
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

Anthropic의 도구 엔지니어링 아티클로(2025-09), 이 코스는 '평가 트랙을 어떻게 세우는가'에 관한 1차 실무 지침으로 씁니다. 결정론적 시스템과 비결정론적 에이전트의 정의적 대비, 평가 과제는 실제 사용에 뿌리를 두고 충분한 복잡도를 갖춰야 한다는 점, 평가 프롬프트마다 검증 가능한 결과를 짝지어야 하며 검증기는 '정확한 문자열 일치'부터 'Claude를 판정자로 세우기'까지 스펙트럼 위에 놓인다는 점, 평가는 '에이전틱 while 루프 하나에 과제 하나'로 프로그램에서 실행한다는 점, 통과율 말고도 실행 시간·호출 수·토큰 소비·도구 오류 같은 지표를 모은다는 점, 오버피팅을 막기 위해 홀드아웃 세트를 쓴다는 점입니다.

핵심 인용:
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

Claude Code 공식 베스트 프랙티스 문서입니다(계속 갱신되는 리빙 페이지이며, 이전 블로그 글에서 리다이렉트되었고, 인용할 때 날짜를 붙이지 않습니다). 이 코스는 '에이전트가 스스로 돌릴 수 있는 검사를 쥐여 준다'는 본류를 여기서 가져옵니다. 돌릴 수 있는 검사가 없으면 '다 된 것처럼 보인다'가 유일한 신호가 되고 사람이 검증 루프가 된다는 점, 통과/실패 신호가 있으면 루프가 스스로 닫힌다는 점, 그 검사는 테스트·빌드 종료 코드·린터·베이스라인과 출력을 비교하는 스크립트·스크린샷 비교일 수 있다는 점, 작업을 한 모델이 자기 채점을 맡아서는 안 된다는 점, 빈틈을 찾으라고 시킨 리뷰어는 언제나 무언가를 찾아낸다는 점 — 그래서 '정확성에 영향을 주는 문제만 보고하라'로 제약해야 한다는 점입니다.

핵심 인용:
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

Claude 개발자 플랫폼의 'Test and Evaluate' 공식 문서입니다(예전에 따로 있던 '성공 기준 정의', '테스트 만들기', 'eval 도구' 페이지가 이 한 페이지로 합쳐졌습니다. 독자에게 별도의 eval 도구 페이지를 찾아보라고 안내해서는 안 됩니다). 성공 기준의 측정 가능성 요건을 완결된 예시와 함께 제시하고, 평가 설계의 세 원칙(실제 분포에 맞추기, 가능하면 채점을 자동화하기, 케이스별 품질보다 양을 우선하기), 네 가지 채점 방식의 트레이드오프 순서(코드 기반 채점이 가장 빠르고 신뢰할 만하며, LLM 기반 채점은 빠르고 유연하지만 판정자를 먼저 검증해야 하고, 사람 채점은 가장 유연하지만 느리고 비싸므로 가능하면 피한다), 그리고 판정자 프롬프트 기법(출력 형식 제약, 채점 전에 추론하게 하기)을 담고 있습니다.

핵심 인용:
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

도구 호출에 관한 공식 문서입니다. 이 코스는 두 가지만 뽑아 씁니다. `strict: true`는 도구 호출이 API 계층에서 스키마를 엄격히 따르도록 보장한다는 점(검증의 한 부류를 플랫폼 보증으로 앞당깁니다), 그리고 '모델이 빠진 파라미터를 먼저 물어본다' 같은 이상적 동작은 공식 문서가 명시적으로 보장하지 않는다는 점입니다 — 보장되지 않는 동작이야말로 평가 세트가 다뤄야 할 대상입니다.

핵심 인용:
> "Add strict: true to your custom tool definitions to ensure Claude's tool calls always match your schema exactly."
> "Claude responds with stop_reason: \"tool_use\" and one or more tool_use blocks. Your code executes the operation and sends back a tool_result."
> "If the user's prompt doesn't include enough information to fill all the required parameters for a tool, Claude Opus is much more likely to recognize that a parameter is missing and ask for it."
> "This behavior is not guaranteed, especially for more ambiguous prompts and for less capable models."
