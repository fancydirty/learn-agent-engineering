# Sources

All key claims in this course are backed by the sources listed below. The main text cites them as `[^Sn]`, with specific excerpts provided under each entry. All quotes were verified character-by-character from the final page (including post-redirect URLs) on 2026-08-26, preserving the original curly quotes and em-dashes without any rewording.

Writing discipline (applies to all lessons):
- Citations only endorse claims that actually exist in the quoted text; numbers, thresholds, or rankings not present in the quote must NOT carry a `[^Sn]` citation.
- None of the sources contain first-hand material on "regression test baselines / running evals in CI / score drift detection" — these may be described as engineering common sense but must not carry citations or be claimed to come from Anthropic.
- No source provides a numerical threshold for "how large an eval set needs to be" — do not fabricate one.
- No source lists compilers or static type checkers as verifiers — do not attribute them to Anthropic.
- S4 is a continuously updated official documentation page (redirected from a 2025 blog post, content has been rewritten); when citing it, refer to it as "Claude Code official documentation" and do not specify a publication date.

## S1 — Building Effective AI Agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/building-effective-agents

- authority: authoritative-guide

Anthropic's authoritative article on agent patterns (2024-12). The page top has a first-party banner noting that the tool ecosystem description is outdated, but this course only draws on the principled claims about evaluation and trust: autonomy brings compounding errors thus requires sandbox testing and guardrails, each step needs ground truth feedback from the environment, complexity is only worth adding when measurable improvement justifies it, code can be verified through automated tests but human review remains essential, and separating "the doer" from "the checker" works better.

Key quote:
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

Anthropic's engineering retrospective on a multi-agent research system (2025-06), the core source for this course: traditional testing assumes "same input follows same path" but agents don't satisfy this assumption; you need to evaluate end-states rather than step-by-step checking; an eval set starting from about 20 real queries is effective, and when effect sizes are large even a few test cases reveal the difference; free-form text uses an LLM judge with rubric-based scoring (single call, 0.0–1.0 plus pass/fail is most stable); edge cases missed by automated evals need to be caught by manual testing.

Key quote:
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

Anthropic's tool engineering article (2025-09), used by this course for first-hand practices on "how to set up an eval track": the definitional contrast between deterministic systems and non-deterministic agents; eval tasks should be grounded in real usage and have sufficient complexity; each eval prompt should be paired with a verifiable outcome, with verifiers ranging from "exact string match" to "Claude as judge" on a spectrum; run evals programmatically with "one task per agentic while-loop"; collect metrics beyond pass rate including runtime, call count, token consumption, and tool errors; use held-out sets to prevent overfitting.

Key quote:
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

Claude Code official best practices documentation (continuously updated living page, redirected from earlier blog posts, not dated when citing). This course draws the mainline "give the agent a check it can run itself": without a runnable check "looks done" is the only signal and you become the verification loop; with a pass/fail signal the loop closes on its own; the check can be tests, build exit code, linter, diffing script against baseline, screenshot comparison; the model doing the work should not be the one grading itself; a reviewer asked to find gaps will always find some — constrain it to "only report issues affecting correctness."

Key quote:
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

Claude developer platform "Test and Evaluate" official documentation (the former separate pages for "defining success criteria," "building tests," and "eval tools" have been merged into this single page; do not direct readers to look for a separate eval tools page). Provides measurability requirements for success criteria with full examples, three principles of eval design (match real distribution, automate grading when possible, prioritize volume over per-case quality), the tradeoff ordering of four grading methods (code-based grading is fastest and most reliable, LLM-based grading is fast and flexible but requires validating the judge first, human grading is most flexible but slow and expensive and should be avoided if possible), and judge prompt techniques (constrain output format, reason before scoring).

Key quote:
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

Official documentation on tool calling. This course extracts only two points: `strict: true` ensures tool calls strictly conform to the schema at the API layer (moving one class of verification forward as a platform guarantee); ideal behaviors like "the model will proactively ask for missing parameters" are explicitly not guaranteed by the official docs — behaviors that are not guaranteed are exactly what eval sets should cover.

Key quote:
> "Add strict: true to your custom tool definitions to ensure Claude's tool calls always match your schema exactly."
> "Claude responds with stop_reason: \"tool_use\" and one or more tool_use blocks. Your code executes the operation and sends back a tool_result."
> "If the user's prompt doesn't include enough information to fill all the required parameters for a tool, Claude Opus is much more likely to recognize that a parameter is missing and ask for it."
> "This behavior is not guaranteed, especially for more ambiguous prompts and for less capable models."
