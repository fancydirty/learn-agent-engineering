# Lesson 4: LLM as Judge: Rubrics, Formats, and What Not to Let It Judge

> Learning goals:
> - Write a multi-dimensional rubric for free-form text outputs, make each dimension's question clear, and understand that one success criterion often needs several rubrics to fully evaluate
> - Tighten judge output into a shape programs can handle: reason first then score, 0.0–1.0 plus pass/fail, and explain why a single call is often more stable than multiple judges evaluating separate aspects
> - Recognize three failure modes of judges—grading their own work, being asked to find problems so they always do, trusting only the agent's self-report—and provide actionable mitigations for each
>
> Prerequisites: Lessons 1–3, understanding "end-state first" evaluation and the prioritization of deterministic verifiers | Previous: [<< Lesson 3](./03-deterministic-checks.md) | Next: [Lesson 5 >>](./05-eval-sets.md)

## Where Lesson 3 hits its ceiling, and where LLM judges fit

You've given your research agent a task: summarize how domestic EV charging subsidies changed over the past three years, produce a two-page brief. It ran for fifteen minutes, called search tools, fetched PDFs, wrote 1,800 words. Reads plausible.

Now you want to verify it. None of Lesson 3's deterministic checks apply here: no test suite to run, no build exit code to read, no `golden_answer` for `output == golden_answer` because you can't write one—put two human analysts on the same brief and they won't produce identical text.

This isn't a failure of imagination. This is what these outputs look like. When Anthropic reflected on their multi-agent research system, they were direct: research outputs are free-form text, rarely have a single correct answer, so they're difficult to evaluate programmatically—LLMs are a natural fit for grading outputs like this[^S2].

But before you casually toss the brief to another model and ask "how's this look," understand where LLM judges sit in the official ranking. The principle for choosing a grading method is "fastest, most reliable, most scalable"[^S5]: code-based grading is fastest and most reliable, extremely scalable, but lacks nuance for complex judgments requiring less rule-based rigidity[^S5]; LLM-based grading is fast, flexible, scalable, and suitable for complex judgment—and the official guidance pairs that with a prerequisite in the same sentence: test to ensure reliability first, then scale[^S5]; human grading is most flexible and high quality, but slow and expensive, so avoid if possible[^S5].

Treat the prerequisite in that middle option as a hard requirement, not a disclaimer. An LLM judge isn't "a smarter check," it's a model call: it can make mistakes, it costs money, it might score the same input differently on successive runs. Its value is singular—it reaches things deterministic checks can't.

So this lesson isn't about "how to get a model to score your output." That's trivial—any prompt gets you a number. It's about making that number worth trusting: how to structure rubrics, how to constrain output, who runs the judge, how it breaks, and when you shouldn't ask it at all.

## Rubrics: breaking "good" into separately answerable questions

A rubric sounds formal. In plain terms, it's a scorecard: break vague "is this good" into specific questions, answer each separately, score each separately.

Why break it down? Ask "is this brief good" and the model gives you vague praise or vague criticism. Ask "does every claim in the brief appear in its cited sources" and the model can check claim by claim. Most use cases need multidimensional evaluation along several success criteria[^S5].

Anthropic's research agent used a five-dimension rubric[^S2], each dimension behind a real failure mode:

- **Factual accuracy—do claims match sources?** The model says "subsidies dropped 30% in 2023," does the cited document actually contain that number? This dimension catches hallucination.
- **Citation accuracy—do the cited sources match the claims?** Opposite direction from the previous dimension; many people conflate them. The first asks "is this statement backed up," this one asks "does the link attached to this sentence actually discuss this topic?" A common agent failure: the claim is fine, but it's tagged with a source whose title merely looked relevant.
- **Completeness—are all requested aspects covered?** You said "past three years" and it only wrote about last year, you said "changes" and it only wrote current state. Check each requirement, don't evaluate how pretty the prose is.
- **Source quality—primary sources or low-quality secondary?** This dimension catches the sneakiest problems. Anthropic's human testers found: early agents consistently chose SEO-optimized content farms over authoritative but less highly-ranked sources like academic PDFs or personal blogs[^S2]. The output reads completely normal, but the foundation is rotten.
- **Tool efficiency—right tools, reasonable call count?** Getting the same answer with three searches versus thirty searches differs by an order of magnitude in cost. This dimension evaluates process economics, not "did it follow my prescribed steps"—the latter doesn't work, as Lesson 2 explained.

These five dimensions are for research tasks. Different tasks need different sets. What you can take is the decomposition method: start from "if this output breaks, how does it break," derive dimensions from that, one failure mode per dimension. Also don't miss: a given use case, or even a specific success criterion for that use case, might require several rubrics for holistic evaluation[^S5]. Don't expect one scorecard to cover everything.

## Output format: one call, one score, one pass/fail

**First, the shape of the verdict.** Anthropic tried multiple judges evaluating different components—one judge per component. The result: a single LLM call with a single prompt outputting scores from 0.0-1.0 and a pass-fail grade was the most consistent and aligned with human judgments[^S2].

Fair statement: breaking evaluation into multiple LLM calls, each call evaluating one aspect, is itself an automating-evals pattern the official guidance has described[^S1]. Neither approach is wrong. The difference is "single-call is better" comes from Anthropic's comparison on their own real system[^S2]. Recommended approach: start with a single call, and only split if you have evidence that splitting improves accuracy.

**Next, how tightly to constrain output.** Official guidance for judge prompts is "empirical or specific": for example, instruct the LLM to output only 'correct' or 'incorrect', or to judge from a scale of 1–5; purely qualitative evaluations are hard to assess quickly and at scale[^S5]. In plain terms: if the judge returns "overall quality acceptable, but some details handled somewhat roughly," you have nothing—you can't average 200 such responses, can't tell if today's better than yesterday's, and you still have to read each one. So why ask the judge?

**The critical technique: reason first, score second, then discard the reasoning.** Official guidance explicitly states this: ask the LLM to reason first before producing an evaluation score, and then discard the reasoning—this increases evaluation performance, particularly for tasks requiring complex judgment[^S5]. "Discard" doesn't mean don't look at it. The reasoning is scaffolding for the judge—it needs to write "paragraph 3's claim maps to which transcript segment" before it can judge accurately. But that text shouldn't enter your downstream statistics. The report wants scores and pass/fail; reasoning goes to logs, waiting for you when a score looks suspicious.

**What about subjective dimensions?** Some dimensions can't be binary, like "is this brief's tone appropriate for sending to clients?" Official guidance provides a tool: the LLM-based Likert scale, which uses an LLM to judge subjective attitudes or perceptions[^S5]—a Likert scale is those fixed-increment questionnaire formats like "strongly disagree / disagree / neutral / agree / strongly agree" (the number of points is a survey-design convention, not an official mandate). The key principle still holds: give it fixed increments, don't let it free-form.

Putting it together, judge output looks roughly like this (example shows only first three dimensions; `source_quality` and `tool_efficiency` have the same shape, omitted for brevity). Programs read `score` and `verdict`; `reasoning` gets persisted for review:

```json
{
  "factual_accuracy": { "reasoning": "Paragraph 2's '30% reduction' appears verbatim on page 4 of source A; paragraph 4's 'multiple regions suspended payments' has no support in any of the three sources.", "score": 0.5 },
  "citation_accuracy": { "reasoning": "4 of 5 citations match their claims; citation 3's link goes to a different article on the same site.", "score": 0.8 },
  "completeness": { "reasoning": "Task required past three years, brief only covers 2024 and 2025.", "score": 0.6 },
  "verdict": "fail"
}
```

## The one doing the work can't be the judge

At this point, a tempting shortcut appears: have the agent grade itself at the end. It knows best what it just did.

Suppress that temptation. Two reasons. **First, official experience**: implementing guardrails where one model instance processes user queries while another screens them for inappropriate content or requests tends to perform better than having the same LLM call handle both guardrails and the core response[^S1]—that experience originally described content moderation (one instance responds, another screens), but the principle "don't let the same call wear both hats" applies here. Note it says "same call"—the problem is shared context, not insufficient intelligence. **Second, the mechanism**: Claude Code official documentation describes a practice where a reviewer running in a fresh subagent context sees only the diff and the criteria you give it, not the reasoning that produced the change, so it evaluates the result on its own terms[^S4].

Read it backward to see why self-grading fails: the chain of reasoning that produced the output is still hanging in context. The model just convinced itself "writing it this way is correct," you immediately follow with "is this correct," and it will likely repeat the same reasoning. What you get isn't an independent judgment, it's self-repetition.

**If you're worried the judge is too lenient or too strict**, official guidance provides a knob: evaluating whether a given piece of content is inappropriate, with multiple prompts evaluating different aspects or requiring different vote thresholds to balance false positives and negatives[^S1]. In a verification scenario, a false positive is "flagging something fine as broken"—you'll be annoyed to death by false alarms; a false negative is "letting something broken through"—bad work ships. Three judges with two needing to say fail before it counts as fail is more lenient than one judge saying fail counts as fail—which setting you pick depends on which kind of error costs more in your scenario.

```agentmentor-check
{
  "id": "vq-zh-04-self-grading",
  "label": "Think it through",
  "prompt": "A colleague proposes: have the agent grade itself at the end and include the score in the final report. Their reasoning is it best understands the task context so it'll judge most accurately, plus it saves a model call. How do you respond?",
  "whyHere": "This section just covered 'separate the doer from the gatekeeper.' This checks whether you treat 'saving one call' as acceptable justification, and whether rejecting self-grading makes you jump all the way to 'must use human review only.'",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Saving the call makes sense, let it self-grade. Just add a line in the prompt like 'please be honest, don't protect your own work,' write the criteria clearly, and the problem's solved.",
      "correct": false,
      "feedback": "'Please be honest' doesn't change its position. The chain of reasoning that produced this output still sits in the same context. The model just convinced itself 'this is correct,' immediately asking 'is it correct' will likely get a repetition of the same justification, not an independent judgment. Official practice is to separate the roles: one model instance does the work, another screens—this tends to perform better than the same call wearing both hats."
    },
    {
      "id": "b",
      "text": "Self-grading is wrong. Hand evaluation to a reviewer in a fresh context—it only sees the output and the criteria you gave, can't see the reasoning that produced the output, so it judges the result itself. The saved call isn't worth as much as an independent judgment.",
      "correct": true,
      "feedback": "Correct. The key difference isn't model capability, it's context: a reviewer in a fresh context doesn't have access to the 'why we wrote it this way' justification, it can only speak to the result against the criteria. This also explains why judge prompts need the full task requirements and rubric pasted in—it doesn't have the background you think it has."
    },
    {
      "id": "c",
      "text": "Self-grading definitely doesn't work, so this kind of free-form text output can only use human review. LLM judges aren't reliable in this scenario.",
      "correct": false,
      "feedback": "First half correct, second half jumps too far. Human grading is most flexible and high quality, but slow and expensive; official guidance is to avoid if possible. The problem with LLM judges isn't 'can't use them,' it's that you need a different instance with a clean context to run it, and you must validate it's reliable before scaling. Self-grading specifically fails because of shared context, not because LLM judges are inherently unreliable."
    }
  ]
}
```

## How judges break

You've switched to a different instance, you've written a rubric, and the judge still breaks. It breaks in predictable ways.

**One: reviewers asked to find problems will always find problems.** Most counterintuitive, most expensive. Official documentation is clear: a reviewer prompted to find gaps will usually report some, even when the work is sound, because that is what it was asked to do[^S4]. The consequence isn't just "a few useless suggestions": the same passage notes that chasing every finding leads to over-engineering—extra abstraction layers, defensive code, and tests for cases that can't happen[^S4]. Your agent enters a self-escalation loop: reviewer suggests three things, you fix them, re-review suggests three more, code gets thicker, actual problems remain unsolved.

You've probably seen these reports: "suggest adding empty-string defense to `parseDate`"—but upstream already guarantees non-empty; "suggest extracting these three constants into config"—but they haven't changed in three years; "suggest adding retry tests for network timeout"—but this path has no network calls. All three aren't wrong, all three aren't worth doing, but mixed into a review report they look identical to real issues.

Official guidance provides the mitigation: tell the reviewer to flag only gaps that affect correctness or the stated requirements, and treat the rest as optional[^S4]. Write that verbatim into the judge prompt, and give "other suggestions" a place to go—add an `optional_notes` field and explicitly state it doesn't participate in scoring. Somewhere to write means it doesn't have to cram style preferences into deduction justifications.

**Two: agent self-reports aren't evidence.** Many people take a shortcut and only feed the agent's final summary to the judge: "I retrieved three authoritative sources and cross-checked before confirming the subsidy rate." Judge reads it, thinks the process sounds solid, gives a high score. But this statement isn't evidence. Official guidance on tool evaluation makes the point: what agents omit in their feedback and responses can often be more important than what they include—LLMs don't always say what they mean[^S3]. It says "cross-checked three sources" but might have only called search once; the failed retry it doesn't mention, the moment it got empty results and kept fabricating, that's what you most need to see. The solution is also direct: review the raw transcripts (including tool calls and tool responses) to catch any behavior not explicitly described in the agent's chain-of-thought[^S3]. Translated to a solution: **judge input must include raw logs, not just self-report.** The "tool efficiency" dimension especially needs this—it evaluates actual call count and whether calls were correct; that information only exists in logs.

**Three: the question itself is ambiguous.** Strictly speaking this isn't the judge breaking, it's that you gave it a broken question. Official guidance on eval design names a category to avoid: ambiguous test cases where even humans would find it hard to reach an assessment consensus[^S5]. You'll recognize these when validating the judge: you and a colleague judge the same output and get opposite results. Don't rush to fix the judge prompt—the judge is "inaccurate" because this question has no accurate answer. Either refine the criteria until humans can agree, or remove this case. Using it to compute the judge's consistency rate only produces a self-deceptive number.

## When to build a review-revise loop

Does the judge finish and you're done, or do you feed its feedback to the agent for a revision, then judge again? This loop is tempting, and it easily becomes a token-burning perpetual motion machine.

Official guidance provides two signals for when this workflow truly fits[^S1]: first, that LLM responses can be demonstrably improved when a human articulates their feedback; and second, that the LLM can provide such feedback. The same passage adds a prerequisite: this workflow is particularly effective when we have clear evaluation criteria, and when iterative refinement provides measurable value[^S1].

Use those two conditions as admission tests. The approach is straightforward: you be the judge first, write feedback to the agent, see if it actually improves after revision. **If human-written feedback doesn't move it, LLM-written feedback will move it even less**. At that point what needs fixing is the prompt or the tools, not adding a review layer. Conversely, if human feedback clearly works, check the second condition—have an LLM write feedback against the rubric, compare it to yours. If both pass, the loop is worth building.

## Proportionality: a judge is also a model call

Return to Lesson 3's ranking. The principle for choosing a grading method is fastest, most reliable, most scalable[^S5]; code-based grading ranks ahead of LLM-based grading on all three[^S5]. So judges go where deterministic checks can't reach, not as their replacement. For the same brief, the correct layering looks like this:

```text
Layer 1 (deterministic, milliseconds, zero cost)
  Valid JSON / Markdown? Length in required range?
  Citation links reachable (HTTP status)? Citation count >= 3?
  Any item fails → immediate fail, don't invoke judge

Layer 2 (LLM judge, seconds, billed by token)
  Five-dimension rubric scoring + pass/fail
  Input: task requirements + output + raw logs (tool calls & responses)

Layer 3 (human, slow and expensive, spot-check only)
  Judge said fail but you're suspicious
  Random sample of judge-said-pass to guard against systematic leniency
```

Don't send Layer 1 catches to Layer 2 to pay—output that isn't even valid format doesn't need a model call to tell you it's unacceptable. Layer 3 can't be skipped: people testing agents find edge cases that evals miss[^S2]; the earlier "consistently preferring content farms" bias was caught by human testing[^S2].

**This lesson's boundary**: how to organize eval sets, how many cases to run this judge against—that's Lesson 5. Wiring the judge into a repeatable eval harness that produces reports—that's Lesson 6. This lesson only solves how to make a single judgment trustworthy.

## 💻 Exercises

<!-- exercises -->

### Level 1: Diagnose a broken judge prompt (no code)

Someone added "self-check" to their research agent, with this prompt:

```text
You just finished writing this industry brief. Now please evaluate your own summary:
Do you think this summary is good? Please evaluate its strengths and weaknesses in detail,
be as comprehensive as possible, and list all the improvement suggestions you can think of.
Thank you!
```

**Your task:** ① List **at least 4** flaws in this prompt, each corresponding to a rule covered in this lesson (write which rule and why this violates it); ② Rewrite it into a working version that's directly usable, not a description of "how it should be written."

<!-- hint -->
Hint 1: Scan from three angles—**who's judging** (is there a problem with this judge's identity), **judging what** (does it know what good means), **output how** (can your program handle what you get back). Each angle yields at least one flaw.
<!-- /hint -->

<!-- hint -->
Hint 2: Notice that last part "be as comprehensive" "list all suggestions you can think of." Go back to "How judges break" first mode, think about what that produces and what happens when you implement everything. Then ask yourself: where in this prompt is the **source material** the judge needs to verify facts?
<!-- /hint -->

<!-- rubric -->
Self-evaluation criteria:
- Identified at least 4 flaws, each maps to a lesson rule; covered at least 4 of these issues: ① having the working model self-grade violates "separate doer from gatekeeper"; ② no rubric, "good" isn't broken into separately answerable dimensions; ③ no output format constraint, purely qualitative feedback can't be assessed quickly at scale; ④ no score and pass/fail, nothing to compare across versions; ⑤ no "write evidence first then score" ordering; ⑥ "be comprehensive / list all suggestions" encourages nitpicking, chasing each one leads to over-engineering; ⑦ doesn't give the judge the input it needs—no task requirements, no source materials, no tool call logs.
- Rewrite is **directly usable complete prompt**, not bullet points, and includes at minimum: fresh-context reviewer identity (stating this prompt goes to an independent new call, not appended to the writing call), placeholders for output under review and its source materials/logs, rubric stating what each dimension asks, 0.0–1.0 score per dimension, overall pass/fail, "write supporting evidence first then score" ordering requirement, "only flag issues affecting correctness or stated requirements, rest goes to optional suggestions and doesn't count toward score" constraint, fixed JSON output format.
- Rewrite doesn't contain questions like "do you think … is good" that lack a baseline.
<!-- /rubric -->

<!-- answer -->
**Part 1: Flaws and corresponding rules**

1. "You just finished writing … now evaluate your own"—the working model judges itself. Violates: implementing guardrails where one model instance processes user queries while another screens them tends to perform better than having the same LLM call handle both[^S1]; a reviewer in a fresh context can't see the reasoning that produced the result, so evaluates the result on its own terms[^S4].
2. "Do you think this summary is good"—no rubric. Violates: most use cases need multidimensional evaluation along several success criteria[^S5], and a given criterion might even require several rubrics[^S5].
3. "Please evaluate strengths and weaknesses in detail"—purely qualitative feedback, no score, no format. Violates: instruct the LLM to output 'correct'/'incorrect' or 1–5; purely qualitative evaluations are hard to assess quickly and at scale[^S5].
4. Doesn't require "write evidence first then score." Violates: ask the LLM to reason first before producing an evaluation score, then discard the reasoning—increases evaluation performance, particularly for tasks requiring complex judgment[^S5].
5. "Be as comprehensive" "list all suggestions you can think of"—encouraging nitpicking. Violates: a reviewer prompted to find gaps will usually report some even when work is sound; chasing every finding leads to over-engineering[^S4]; fix is to flag only gaps affecting correctness or stated requirements[^S4].
6. No source task requirements, source materials, tool call logs. Violates: what agents omit can be more important than what they include; review raw transcripts (tool calls and responses) to catch behavior not in the agent's self-description[^S3].

**Part 2: Rewrite (directly usable)**

```text
You are an independent reviewer. You did not participate in writing the industry brief below
and cannot see its writing process. Judge the brief itself based solely on the task requirements,
source materials, and execution logs below.

【Original task requirements】{{task_spec}}
【Brief under review】{{report}}
【Full text of sources cited in brief】{{source_documents}}
【Raw logs of this execution: tool calls and tool responses】{{raw_transcript}}

【Rubric】Answer each dimension separately:
1. factual_accuracy: Can every claim in the brief be found in the source materials?
   Numbers, dates, names, conclusions absent from sources count as inaccurate; summarizing
   and paraphrasing don't count.
2. citation_accuracy: Does each citation's linked source actually discuss the claim it supports?
   Source exists but content doesn't match the claim deducts here (doesn't affect dimension 1).
3. completeness: Are all aspects named in task requirements covered? Check requirements line by line.
4. source_quality: Are primary sources used (original docs, official releases, academic materials)
   or highly-ranked but low-quality secondary retellings?
5. tool_efficiency: Based on execution logs, were the right tools used, is call count obviously
   redundant? Base on logs only, don't trust the brief's self-description of its process.

【Scoring requirements】
- Order: For each dimension, write evidence first (must specifically cite which sentence in the brief,
  which part of sources, or which call in logs; if no issue found write "none found").
  Write evidence complete, then give score.
- score: 0.0 to 1.0. 1.0 means no issues found in this dimension, 0.0 means severe failure.
- verdict: "pass" if all dimensions >= 0.7 AND factual_accuracy >= 0.9, otherwise "fail".
- Only flag issues affecting correctness or achievement of task requirements. Phrasing,
  structure, formatting preferences all go into optional_notes; that field doesn't participate
  in scoring and doesn't affect verdict.
- Output strictly in the JSON structure below, no text outside the JSON.

【Output format】
{
  "factual_accuracy":  { "evidence": "", "score": 0.0 },
  "citation_accuracy": { "evidence": "", "score": 0.0 },
  "completeness":      { "evidence": "", "score": 0.0 },
  "source_quality":    { "evidence": "", "score": 0.0 },
  "tool_efficiency":   { "evidence": "", "score": 0.0 },
  "optional_notes": [],
  "verdict": "<pass or fail>"
}
```

One more thing not in the prompt but equally critical: send this prompt in a **fresh independent call** (start a new conversation or subagent with no writing history). No matter how convincingly you declare "you are an independent reviewer" in the identity, if you append it to the writing call, it still sees all the writing reasoning.

Those final two thresholds (0.7 and 0.9) are your own picks; no official source gives those numbers. Their purpose is to make pass/fail computable. After you complete Level 2's judge validation, come back and tune them.
<!-- /answer -->

### Level 2: Design a complete judging scheme for "meeting summary from transcript"

Scenario: Your agent daily compresses meeting transcripts into summary notes with conclusions and action items. Summaries are free-form text with no standard answer, but errors are expensive—miss one action item and nobody does that task.

**Your task:** ① Design a three-dimension rubric (faithfulness to facts, coverage of key points, no missing action items), each dimension 0.0–1.0 plus overall pass/fail, write clearly what each dimension asks and what counts as a deduction; ② Write **complete judge prompt**, including reason-first-then-score ordering and strict output format constraints; ③ Design "validate the judge itself" steps: prepare a small set of human-labeled good/bad examples, run judge, compare agreement rate, and specify **what to fix first, what to fix later** when agreement rate is insufficient. No need to actually call APIs, deliverables are prompt, JSON, and steps themselves.

<!-- hint -->
Hint 1: Three dimensions aren't three slogans; each must answer "what counts as deduction, what doesn't." For example faithfulness: information not in transcript written into summary counts as deduction, but condensing three sentences into one doesn't. Write these boundaries into the prompt so the judge stays stable. Action items dimension also needs to cover an additional thing—whether assignee and deadline got swapped around.
<!-- /hint -->

<!-- hint -->
Hint 2: Human-labeled examples can't all be good examples. Manufacture bad examples by dimension: one stuffs numbers not in transcript, one omits a concluded agenda item, one gets action item assignee wrong. This way when judge disagrees with you, you immediately see which dimension definition wasn't clear. Also, when you and a colleague both judge a case inconsistently, suspect the case first, not the judge.
<!-- /hint -->

<!-- rubric -->
Self-evaluation criteria:
- **Rubric**: Each of three dimensions has clear "what deducts / what doesn't" boundaries, not just dimension names; action items dimension covers both "omission" and "assignee or deadline wrong."
- **Prompt**: Complete and directly usable, contains transcript & summary placeholders; explicitly states reviewer isn't the writer; requires each dimension write supporting evidence first (point to specific location in transcript/summary) then score; has 0.0–1.0 scores, has pass/fail with judgment rule; has "only flag issues affecting correctness, rest goes to non-scoring field" constraint; ends with fixed JSON format and requirement not to output other content.
- **Validation scheme**: Contains human-labeled example set (good examples + bad examples designed separately by dimension), humans judge first line by line, judge runs same batch, compare agreement rate by pass/fail and per-dimension scores, separately look at which dimension disagreements concentrate.
- **Fix ordering** specified with reasoning, order is: check examples/criteria themselves first (ambiguous cases where even humans disagree need rewriting or removal) → fix judge prompt next (add dimension definitions, add positive/negative examples, tighten output) → only then consider switching models or adding multi-prompt voting.
- Explicitly states "don't scale to full case set until judge validation passes"; thresholds can be self-defined but must state they're your own, don't fabricate official numbers.
<!-- /rubric -->

<!-- answer -->
**1. Three-dimension rubric**

- **faithfulness**: Can every statement in summary be found in transcript? Deduct: numbers, names, dates, conclusions not in transcript; upgrading "someone proposed" to "meeting decided" (strength escalation). Don't deduct: summarizing, merging, rephrasing.
- **coverage**: Are all topics discussed by multiple people or with explicit conclusions mentioned? Deduct: omitting a concluded agenda item; writing conclusion backward. Don't deduct: omitting content mentioned only in passing once with no conclusion.
- **action_items**: Are all "who does what by when" commitments from transcript in the list? Deduct: missing one item; assignee wrong; deadline wrong or fabricating a deadline transcript didn't state. Don't deduct: transcript genuinely didn't state deadline, summary accurately marks "not determined."

Overall verdict: any dimension below 0.6, or faithfulness below 0.8, verdict is fail; otherwise pass. These two thresholds are self-defined starting points; tune after step 3 validation.

**2. Complete judge prompt**

```text
You are an independent reviewer of meeting summary notes. You did not participate in writing this
summary and cannot see its generation process. Judge this summary based solely on the meeting
transcript and rubric below.

【Original meeting transcript】{{transcript}}
【Summary under review】{{summary}}

【Rubric】
1. faithfulness: Can every statement in the summary be found in the transcript?
   - Deduct: numbers, names, dates, conclusions not in transcript written into summary;
     expressing "someone proposed" as "meeting decided" (escalating conclusion strength).
   - Don't deduct: condensing multiple sentences into one; rephrasing; omitting
     off-topic chat unrelated to agenda.
2. coverage: Are all topics discussed by multiple people or with explicit conclusions in transcript
   mentioned in summary?
   - Deduct: omitting an agenda item that reached conclusion; writing a topic's conclusion backward.
   - Don't deduct: omitting content mentioned only in passing once with no conclusion.
3. action_items: For every "who does what by when" commitment in transcript, is it in the summary's
   action items list, with assignee and deadline not wrong or swapped?
   - Deduct: missing one action item; assignee written as someone else; deadline wrong;
     fabricating a deadline when transcript didn't state one.
   - Don't deduct: transcript genuinely didn't determine deadline, summary accurately writes
     "deadline not determined."

【Scoring requirements】
- Order: For each dimension, write evidence first, then give score. Evidence must be specific—
  point out which sentence in summary corresponds to which part of transcript (quote original
  fragment suffices); if dimension has no issue write "none found."
- score: 0.0 to 1.0. 1.0 means this dimension completely fine, 0.0 means severe failure.
- verdict: any dimension below 0.6, or faithfulness below 0.8, output "fail"; otherwise "pass".
- Only flag issues affecting correctness or affecting these notes' use as working reference.
  Language style, item ordering, detail preferences all go in optional_notes; that field doesn't
  participate in scoring and doesn't affect verdict.
- Output strictly in JSON structure below, no text outside JSON, no explanations, no code fences.

【Output format】
{
  "faithfulness": { "evidence": "", "score": 0.0 },
  "coverage":     { "evidence": "", "score": 0.0 },
  "action_items": { "evidence": "", "score": 0.0 },
  "optional_notes": [],
  "verdict": "<pass or fail>"
}
```

Program side only takes the three `score` values and `verdict` for statistics; `evidence` and `optional_notes` persist to disk for review when scores look suspicious. Same as Level 1: send this prompt to a fresh independent call, don't append to the summary-generation call.

**3. Steps to validate the judge itself**

Step one, manufacture example set. Take 12–20 real meeting transcripts (this scale is a self-defined starting point, not from any official source), pair each meeting with 2 summaries, one good one bad, bad ones designed by dimension:

```json
{
  "cases": [
    { "id": "m01-good", "summary": "s/m01-good.md", "human_verdict": "pass",
      "human_notes": "All three dimensions fine" },
    { "id": "m01-bad-faith", "summary": "s/m01-bad-faith.md", "human_verdict": "fail",
      "broken_dimension": "faithfulness",
      "human_notes": "Summary says 'budget approved 800K', transcript only mentions 'submitted for approval'" },
    { "id": "m02-bad-coverage", "summary": "s/m02-bad-cov.md", "human_verdict": "fail",
      "broken_dimension": "coverage",
      "human_notes": "Vendor switch, a concluded agenda item, entire section missing" },
    { "id": "m03-bad-actions", "summary": "s/m03-bad-act.md", "human_verdict": "fail",
      "broken_dimension": "action_items",
      "human_notes": "'Draft by Friday' assignee is Li, summary wrote Wang" }
  ]
}
```

Step two, humans judge first. You and one colleague each independently judge pass/fail and write reasoning, **without seeing judge output**. Cases where you two disagree get set aside separately—see step four.

Step three, run judge, compare two things: **verdict agreement rate** (judge `verdict` matches human label percentage) and **dimension attribution hit rate** (for bad examples, is the dimension where judge deducted hardest the `broken_dimension` you tagged). The latter often reveals more—verdict coincidentally correct but attribution wrong means dimension definitions aren't clear.

Step four, when insufficient, fix in this order, **order cannot be reversed**:

1. **Check examples and criteria first.** Disagreements concentrate on cases where you and colleague also disagreed—problem is in the question not the judge. Ambiguous test cases where even humans would find it hard to reach consensus are what eval design should avoid[^S5]. Refine criteria until humans agree, or remove the case if you can't.
2. **Fix judge prompt next.** Criteria clear, humans agree, judge still wrong—that's a prompt problem. Add to the dimension where disagreements concentrate: write "what deducts / what doesn't" more rigidly, insert one or two positive/negative examples, constrain output format tighter. Re-run same batch.
3. **Only then touch model and structure.** Prompt already very specific, judge still unstable—then consider switching to a stronger model, or using multiple prompts each evaluating one dimension with vote threshold combining verdicts—vote threshold is exactly the knob to balance false positives and false negatives[^S1]. This step goes last because it raises both cost and complexity.

Step five, set threshold then scale. Define your own agreement rate threshold (no official source gives this number; base it on the cost of misjudgment); before meeting threshold don't scale judge to full case set—official guidance for LLM-based grading is test to ensure reliability first, then scale[^S5]. After that, every time you change the judge prompt, re-run this small batch to confirm you didn't break it.
<!-- /answer -->

<!-- /exercises -->

## Recap

- Free-form text outputs have no single correct answer and are difficult to evaluate programmatically; LLMs are a natural fit for grading outputs like this[^S2]; but the official positioning for LLM-based grading is "fast, flexible, scalable, suitable for complex judgment—prerequisite: test to ensure reliability first then scale"; human grading is most flexible and high quality but slow and expensive, avoid if possible[^S5].
- A rubric breaks "good" into separately answerable questions. Research tasks' ready-made decomposition is five dimensions: factual accuracy, citation accuracy, completeness, source quality, tool efficiency[^S2]; a given use case, or even one success criterion within it, might require several rubrics for holistic evaluation[^S5].
- For output shape, a single LLM call with a single prompt outputting 0.0-1.0 scores and pass-fail was the most consistent and aligned with human judgments in actual measurement[^S2]; instruct the LLM to output 'correct'/'incorrect' or 1–5; purely qualitative evaluations are hard to assess quickly and at scale[^S5]. Ask the LLM to reason first before producing an evaluation score and then discard the reasoning—increases evaluation performance, particularly for complex judgment[^S5]; subjective dimensions can use LLM-based Likert scales[^S5].
- The doer can't be the judge: implementing guardrails where one model instance processes queries while another screens tends to perform better than having the same call handle both[^S1]; a reviewer in a fresh context only sees the output and your criteria, can't see the reasoning that produced the output, so judges the result on its own terms[^S4]. Multi-prompt evaluation with vote thresholds balances false positives and false negatives[^S1].
- A reviewer prompted to find gaps will usually report some even when work is sound, and chasing every finding leads to over-engineering; fix is to tell it to flag only gaps affecting correctness or stated requirements, treat the rest as optional[^S4].
- Don't only feed the agent's self-report to the judge: what it omits is often more important than what it includes, LLMs don't always say what they mean[^S3]; review raw transcripts (tool calls and tool responses) to catch behavior not in the self-description[^S3].
- Whether a review-revise loop is worth building depends on two signals: LLM responses can be demonstrably improved when a human articulates feedback, and the LLM can itself provide such feedback[^S1].
- A judge is also a model call, with cost and noise. The principle for choosing grading methods is fastest, most reliable, most scalable; code-based grading ranks ahead on all three[^S5]—deterministic checks that can catch something shouldn't send it to a judge; beyond automated evals still need human spot-checks, people testing agents find edge cases that evals miss[^S2].

[>> Lesson 5: Eval Sets: Start with 20 Real Tasks](./05-eval-sets.md)
