# Lesson 5: Failure and Coordination

> Learning goals:
> - Explain why a subagent claiming it's "done" can't be taken at face value, and why you need an independent way to verify
> - Recognize the two common failures in multi-agent collaboration: duplicate work and conflicting results
> - At the result-integration stage, know how to deduplicate and how to handle contradictory outputs
>
> Prerequisites: complete Lesson 4, able to tell the three collaboration patterns apart and handoff | Prev: [Lesson 4 <<](./04-collaboration-patterns.md) | Next: [Lesson 6 >>](./06-build-a-review-pipeline.md)

Two subagents each research the same cloud provider's starter plan. One reports back that it starts at \$20 a month, the other says \$25 — and both outputs confidently mark themselves "verified, no errors." The earlier lessons all covered how to stand up multi-agent collaboration; this one covers where it breaks down after you've built it — a subagent's self-reported status can't be trusted, duplicate work, conflicting results — and what the orchestrator should do about each.

## A subagent saying "done" doesn't mean it got it right

When a subagent returns a result, it usually tacks on a line like "complete" or "verified, no errors." That statement isn't evidence — it's just the subagent's own summary of its own output, and that summary can be wrong. The official observation of agent behavior is exactly this: "Claude stops when the work looks done. Without a check it can run, "looks done" is the only signal available, and you become the verification loop: every mistake waits for you to notice it."[^S6] Which is why the official advice is to "Have Claude show evidence rather than asserting success."[^S6]

The official docs call this the trust-then-verify gap: "The trust-then-verify gap. Claude produces a plausible-looking implementation that doesn't handle edge cases. Fix: Always provide verification (tests, scripts, screenshots). If you can't verify it, don't ship it."[^S6] That advice was written about writing code, but the same logic applies to any delegation: what a subagent hands back reads smoothly, has the right format, looks like it was done carefully — and all of that is just "plausible-looking," which isn't the same as actually correct. If the orchestrator takes a subagent at its word that it's "done" and splices the output straight into the final result, it has skipped verification entirely.

## How to verify: set a checkable standard for a subagent's output

"Don't take it at face value" is easy to say; the hard part is how to verify. Reading it once and deciding it "looks fine" isn't verification — that's still stuck in the first half of the trust-then-verify gap. The reliable approach is to define a concrete, checkable standard first, then measure the subagent's output against it.

One standard used in a production system looks like this: "We used an LLM judge that evaluated each output against criteria in a rubric: factual accuracy (do claims match sources?), citation accuracy (do the cited sources match the claims?), completeness (are all requested aspects covered?), source quality (did it use primary sources over lower-quality secondary sources?), and tool efficiency (did it use the right tools a reasonable number of times?)."[^S1] What these five criteria share is that each one can be checked concretely, not scored on impression. Factual accuracy can be checked line by line against the sources the subagent cited; completeness can be checked against every requirement listed in the task description, to see whether they were all covered; tool efficiency can be read straight off the call log, to judge whether there were obviously redundant or duplicate calls.

Bringing this into your own collaboration setup, the first step in verifying a subagent's output isn't to ask "does this look right," but to ask "for this task, which criteria can I check concretely" — list them out, then measure the output against each one.

```agentmentor-check
{
  "id": "mac-zh-05-trust-subagent",
  "label": "A subagent says the task is done — can you take it at face value?",
  "prompt": "A subagent returns its result and says: \"Research complete, the data is accurate with no errors.\" The output is neatly formatted and reads smoothly. How should the orchestrator handle this \"data is accurate with no errors\" claim?",
  "whyHere": "A subagent's self-report reads with real confidence, and it's easy to be led by that confident tone into assuming a certain tone means it was actually verified — this is the spot to immediately puncture that misconception with the official trust-then-verify gap",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Take it at face value — if the subagent explicitly said \"accurate with no errors,\" it usually wouldn't say so without reason",
      "correct": false,
      "feedback": "A subagent's self-report isn't evidence. The official guidance is explicit that a gap shows up where the output looks plausible but doesn't handle edge cases, and if you can't verify it you shouldn't take it straight — \"said with confidence\" and \"actually verified\" are two different things, and tone can't substitute for verification."
    },
    {
      "id": "b",
      "text": "Don't take it at face value — define a concrete, checkable standard for this task (like whether facts match the sources, whether citations are accurate) and go through it point by point before deciding whether to use it",
      "correct": true,
      "feedback": "Correct. The official lesson is that output that looks plausible doesn't equal output that actually did it right, and if you can't verify it you can't take it straight; the reliable way to verify is like the criteria the official LLM judge used — define concrete, checkable items (factual accuracy, citation accuracy, completeness, and so on) and measure the subagent's output against each, rather than judging by the subagent's own report or whether it reads smoothly."
    },
    {
      "id": "c",
      "text": "Don't take it at face value, but as long as the format is neat and the content reads smoothly, you can basically judge the output is fine",
      "correct": false,
      "feedback": "\"Neatly formatted, reads smoothly\" is exactly what the official guidance calls looking plausible, and that's precisely where it's easiest to be misled — the surface quality of the output and whether the content is actually accurate or misses edge cases are unrelated things. Real verification has to land on concrete, checkable criteria; it can't stop at \"reads fine.\""
    }
  ]
}
```

## Duplicate work: several subagents doing the same thing

Lesson 3 covered how a task description that isn't detailed enough leads to subagents that "misinterpreted the task or performed the exact same searches as other agents."[^S1] That's the root cause, but the failure usually only surfaces at the moment results are aggregated — the orchestrator receives several subagent outputs and finds that two of them overlap heavily, covering the same thing in different words.

Duplicate work isn't a catastrophic error in itself — the content isn't wrong, it just wastes the tokens and calls that should have covered a different angle. But it's a signal: some subagents' task boundaries weren't drawn clearly enough, and it's worth going back to check the task descriptions from the dispatch step, rather than just manually deduplicating this one batch of results and calling it done. When you spot duplicate work, rather than only deleting the repeated content, it's more worthwhile to figure out why it repeated — whether the two task descriptions overlapped in scope, or the subagents each drifted toward the same, most obvious direction.

## Conflicting results: two subagents reach contradictory conclusions

Trickier than duplicate work is a result conflict — like the scene that opened this lesson: two subagents each do their own research and hand back conclusions that contradict each other, one saying the starter plan starts at \$20 a month, the other saying \$25. You can't deal with this by "just picking one" or "splitting the difference" — both approaches risk serving up a wrong number as the final conclusion.

When you hit a result conflict, the sensible order is: first look at what each side based its answer on — did they consult different sources, one using the provider's current live page and the other accidentally using a cached old page; if the basis can be traced, you can usually tell which one is more trustworthy and replace the unreliable one; if the basis itself can't settle who's right, don't make the call yourself during integration — flag the contradiction as-is for human review, or spin up a new subagent specifically to verify that one point of disagreement. The problem a result conflict exposes is usually more worth worrying about than duplicate work — it means at least one subagent output is wrong, and if you drop it into the final result unhandled, you've packaged an unverified error as a "done" conclusion.

## Result integration and dedup: what the orchestrator does to wrap up

Stitching several subagent outputs into a final result isn't a matter of concatenating them end to end — it means running back through the categories of problem above: is there duplicate content that needs merging, are there contradictory conclusions that need verifying or flagging, does every claim trace back to a corresponding basis. That last point is especially easy to overlook — Lesson 3, "Writing Prompts for Delegation," mentioned that the production system set up a dedicated agent, described as "a CitationAgent, which processes the documents and research report to identify specific locations for citations. This ensures all claims are properly attributed to their sources."[^S1] The same logic holds at the integration stage: once several subagent outputs are pooled together, it's easy to get misattribution — writing up data that subagent A found as a conclusion about the company subagent B was responsible for. Verifying the source attribution of each claim at the integration stage matters just as much as verifying whether the facts themselves are accurate.

Dedup, verifying conflicts, and checking source attribution — those three together are the real work of the "aggregate" step, and not, as Lesson 2 warned, just concatenating the subagents' raw replies and calling it done.

<!-- exercises -->
## 💻 Exercises

### Level 1: Handling a result conflict

Two subagents each research the amount of a company's most recent funding round. Subagent A says it's \$30 million, based on a report from a tech media outlet; subagent B says it's \$35 million, based on a press release the company published itself. Explain how you'd handle this conflict, and how the final result should be presented.

<!-- rubric -->
- Doesn't just "pick one" or "split the difference" and move on
- Mentions concrete ways to verify each side's basis and judge the credibility of the sources
- Explains how the final result should be presented (including what to do when the basis can't settle who's right)

<!-- answer -->
You shouldn't just pick a number or average the two. Start by comparing the credibility of the sources on each side — an official press release is usually more authoritative and closer to a primary source than third-party media coverage, so in this case subagent B's \$35 million is more trustworthy. You can verify the release's publication date and exact wording, confirm there's no misreading, and then use \$35 million as the final result, while noting in the output "differs from the \$30 million in some media reports; the official press release figure is authoritative" rather than quietly dropping the conflict and pretending it doesn't exist. If the two sources are about equally credible and you can't tell which is more reliable, you shouldn't make the call yourself at the integration stage — flag the disagreement as-is for human review, or dispatch a separate subagent to verify it.

<!-- hint -->
Ask first: what did each subagent base its answer on? The sources themselves differ in authority, and that's often enough to tell which to trust — no need to guess or split the difference as a shortcut.

<!-- hint -->
If the sources really are equally credible, honestly flagging the conflict is safer than forcing a choice and risking serving up wrong information.

### Level 2: Writing verification criteria for a subagent task

A subagent's task is: "Read the last month of customer feedback and extract the 3 most frequently mentioned problems." Following the approach of this lesson's official LLM rubric (factual accuracy, completeness, and so on), write 3-4 checkable verification criteria for this specific task. Each criterion should state what exactly to check and how to check it.

<!-- rubric -->
- Writes 3-4 criteria, each concretely checkable rather than a vague "does it read reasonably" standard
- The criteria reflect this specific task (extracting feedback problems), not a copy of the research-report criteria from the official example
- Each criterion explains how to check, not just a criterion name

<!-- answer -->
Sample answer:

1. **Extraction accuracy**: Spot-check against the original feedback to confirm the 3 listed problems were actually mentioned explicitly in the raw feedback, not summarized or extrapolated by the subagent itself.
2. **Ranking accuracy**: Verify these 3 problems really are the top three by mention count — you can have the subagent also provide the specific mention count for each problem, or a list of source quotes, to check whether the ranking holds up.
3. **Coverage completeness**: Confirm the subagent actually read all of the last month's feedback rather than concluding from only a portion — note that you can't just check the count the subagent reports handling, since that's still relying on self-reported status; instead, randomly sample several items from the month's feedback (including a few of the earliest and latest) and check whether their content shows up in the subagent's categorization or counts.
4. **Attribution accuracy**: Check that the original feedback snippet cited under each problem really supports that problem's description, avoiding misattributing one piece of feedback to a different problem.

<!-- hint -->
"Factual accuracy" in this task maps to: are the listed problems really mentioned in the original text, rather than made up by the subagent — figuring out how to spot-check against the source is the concrete checking method for this criterion.

<!-- hint -->
"Completeness" in this task isn't "are all requested aspects covered," it's "did it actually read all the requested feedback" — think about how to verify the subagent didn't rush to a conclusion after reading only part of it.

<!-- /exercises -->

## Recap

- "Done" or "verified, no errors" when a subagent returns is just a self-report, not evidence. Without a check it can run, "looks done" is the only signal available[^S6]; the official docs are explicit that Claude "produces a plausible-looking implementation that doesn't handle edge cases," and if you can't verify it, don't ship it.[^S6]
- Verification can't stop at "reads fine" — define checkable criteria for the specific task, like the rubric the official LLM judge worked from, where factual accuracy, citation accuracy, completeness, source quality, and tool efficiency can each be checked line by line.[^S1]
- **Duplicate work** is a common consequence of task boundaries that weren't drawn clearly[^S1], usually surfacing only when results are aggregated; spotting a duplicate isn't just deleting the extra content, it's worth going back to check the task descriptions from the dispatch step.
- **Conflicting results** — two subagents reaching contradictory conclusions — can't be handled by picking one at random or splitting the difference; verify the credibility of each side's basis first, and when you can't rank them, flag the conflict as-is for human review.
- The integration stage does three things at once: dedup, verify conflicts, and check whether each claim's source attribution is misattributed[^S1] — that's the real work of the "aggregate" step, not just concatenating the subagents' raw replies.

[>> Lesson 6: Hands-On: Building a Two-Agent Review Pipeline](./06-build-a-review-pipeline.md)
