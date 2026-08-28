# Lesson 5: Eval Sets: Start with 20 Real Tasks

> Learning goals:
> - Explain why "wait until we have hundreds of cases" is wrong, and why early-stage changes have effect sizes large enough that a few cases can distinguish between versions
> - Design a batch of eval cases following these principles: grounded in real usage, supplemented with edge cases, automated grading when possible, volume over per-case quality, and deliberate inclusion of ambiguous cases — each paired with a verifiable outcome
> - Use held-out sets to prevent overfitting prompts into "models that only pass these specific questions," and identify which issues automated evals can't see and must be caught by manual testing
>
> Prerequisites: Lessons 1–4 ("looks done" ≠ done, end-state-first verification targets, deterministic verifiers, LLM judges) | Previous: [<< Lesson 4](./04-llm-as-judge.md) | Next: [Lesson 6 >>](./06-build-eval-harness.md)

## A particularly common reason for delay

You've probably seen this scenario. Someone raises the idea: "We should build an eval set for our agent." Another person responds: "An eval set needs hundreds of cases to have statistical significance, right? Running ten or twenty cases produces meaningless scores that mislead more than inform. Let's collect real user cases first and build the set once we have enough."

Sounds professional. Disciplined. Then six months pass, cases sit in a shared doc, the prompt has been revised thirty times, and no one can say whether any revision was an improvement or a regression.

Anthropic's engineering postmortem on their multi-agent research system directly calls out this excuse: they often hear that AI developer teams delay creating evals because they believe only large evals with hundreds of test cases are useful, when it's actually best to start with small-scale testing right away with a few examples rather than delaying[^S2].

This lesson clarifies exactly that: why small sets genuinely work early on, what one case should look like, how to select these cases, and how to prevent "tuning the agent into an expert on these specific questions and nothing else."

## Effect size: why a few cases suffice to spot differences early

Start with a term. **Effect size** refers to how large the gap from a change is — is it a shift from 71.2% to 72.4%, or a jump from 30% to 80%? Larger gaps require fewer samples; smaller gaps require more. This isn't mystical, it's the same common sense you use judging which of two cups of water is hotter: a 30-degree difference is obvious at a touch, a half-degree difference demands a thermometer.

Early agent development belongs to the former category. The official postmortem states it plainly: in early agent development, changes tend to have dramatic impacts because there is abundant low-hanging fruit; a prompt tweak might boost success rates from 30% to 80%, and with effect sizes this large, you can spot changes with just a few test cases[^S2].

Imagine this scenario: you have 6 cases, 2 pass before the change, 5 pass after. Do you need a p-value? No. What you need is to lock in this version of the prompt and go find the next 30%-to-80% improvement.

The scale they started with isn't mysterious either — a set of about 20 queries representing real usage patterns[^S2]. Twenty isn't a magic threshold, it's just a quantity you can finish in an afternoon and start using that same day.

The reverse also holds: when your agent is already at 80%+ and remaining changes move the needle by only a point or two, a few cases genuinely can't distinguish them. At that point you need more cases — but by then you already have a functioning eval set, and expanding it is far easier than building it from scratch. **Get the ruler first, then talk precision; don't wait for the ruler to be precise before you start measuring.**

## Minimum composition of one eval case

An eval set isn't "a pile of prompts." A pile of prompts only lets you eyeball outputs, which gets tedious after two reads and self-deceptive after three.

The tool engineering article is direct: each evaluation prompt should be paired with a verifiable response or outcome; your verifier can be as simple as an exact string comparison between ground truth and sampled responses, or as advanced as enlisting Claude to judge the response[^S3]. This connects directly to the success criteria from Lesson 2, the deterministic verifiers from Lesson 3, and the LLM judges from Lesson 4 — those lessons taught you how to verify, this lesson teaches you what to verify.

So one usable case needs at least three components written clearly:

```text
prompt   : Input to the agent (write it the way a user would say it)
expected : A verifiable outcome (end state, string, state change, or rubric)
verifier : Who judges — deterministic verifier or LLM judge
```

Structured as data, it looks like this:

```json
{
  "id": "cs-003-address-change-after-ship",
  "prompt": "Can I change the address on my order? Order SO-88213, I moved.",
  "expected": {
    "mustCallTools": ["getOrder"],
    "mustContain": ["already shipped"],
    "mustNotContain": ["changed for you"]
  },
  "verifier": "deterministic"
}
```

The `expected` field here describes end states and observable evidence, not "the sequence the agent should think through." Lesson 2's conclusion continues to apply: for the same goal, the agent might take several valid paths, so don't hard-code the path. The tool engineering article also reminds you that you can optionally specify the tools you expect an agent to call to measure whether agents grasp each tool's purpose, but because there might be multiple valid paths, avoid overspecifying or overfitting to strategies[^S3].

The `mustCallTools` field might remind you of `expectedTools` from Lesson 2. The relationship between them is worth nailing down. **Negative assertions** (`mustNotContain`, `mustNotCallTools` — don't say "changed for you," don't guess an order number and query it) are essentially end-state guardrails describing "things that shouldn't happen didn't happen," and can be enforced strictly. **Positive tool assertions** (must have called a certain tool) are the trajectory assertions from Lesson 2, and those three disciplines apply unchanged: only assert set membership, only list the one or two tools you genuinely care about, and if the assertion fails but the end state passes, log an observation rather than immediately failing the case. It only hardens in one scenario: **the key information in the response can only come from that tool's return value**. Case cs-003 is exactly this type — the judgment "already shipped" can only come from `getOrder`, so if the tool wasn't called, that statement is fabricated, making this positive assertion enforceable. When in doubt, treat it as soft.

One more note: this case has `mustNotContain` listing "changed for you" — it guards against the agent verbally agreeing to change the address while actually doing nothing. This "verbal completion" is precisely Lesson 1's theme.

## Five rules for designing eval sets

The five rules below combine the design principles from the Claude platform's "Test and Evaluate" docs and the practices from the tool engineering article into a single checklist — citations after each rule indicate its source.

**One: Ground in real usage.** Generate lots of evaluation tasks, grounded in real-world uses[^S3]; design evals that mirror your real-world task distribution[^S5]. The criterion is straightforward: if this prompt wasn't copied from real logs, can you point at it and say "three users asked exactly this last week"? If not, it's probably something you imagined while sitting at your desk.

**Two: Don't miss edge cases.** The official docs follow "mirror your real-world task distribution" immediately with a reminder: don't forget to factor in edge cases[^S5]. The real distribution is the body, edge cases are insurance. An eval set composed entirely of edge cases will mislead you — you'll spend a month fixing an issue that appears twice a month.

**Three: Automate grading when possible.** Structure questions to allow for automated grading, for example multiple-choice, string match, code-graded, LLM-graded[^S5]. This determines whether your eval set can be run repeatedly. Cases requiring you to read for five minutes to judge pass/fail — after writing ten of those, you'll never want to run them a second time.

**Four: Prioritize volume over quality.** The official wording: more questions with slightly lower signal automated grading is better than fewer questions with high-quality human hand-graded evals[^S5]. This is the most counterintuitive and also the biggest time-saver — spend your time writing ten more cases, not polishing one case's grading criteria to perfection.

**Five: Deliberately collect ambiguous cases.** The docs explicitly list a type of test case worth including: ambiguous test cases where even humans would find it hard to reach an assessment consensus[^S5]. These aren't for boosting scores, they're for surfacing disagreements. When your agent waffles on these cases, it signals that the product-level rules themselves aren't settled, which is something product needs to resolve, not something prompt engineering can fix.

One more point that's not a "design principle" but equally critical: don't make the eval environment too simple. The tool engineering article recommends avoiding overly simplistic or superficial "sandbox" environments that don't stress-test your tools with sufficient complexity; strong evaluation tasks might require multiple tool calls, potentially dozens[^S3]. A question answerable with a single database query won't reveal whether your agent loses context by the seventh tool call.

```agentmentor-check
{
  "id": "vq-zh-05-wait-for-hundreds",
  "label": "How large should an eval set be before it's worth building?",
  "prompt": "The team is discussing whether to build an eval set now. Someone says: 'Anything under a hundred cases has no statistical significance; the scores we'd get would be pure noise. Let's wait until the product stabilizes and we've collected enough real cases.' You're the person who knows verification best. How should you respond?",
  "whyHere": "This is the most common and most plausible-sounding reason for delaying evals. The official postmortem specifically refutes it, with reasoning directly tied to the concept of effect size — checking this after the design rules ensures you take away the judgment criteria, not just a slogan.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Build it now, starting with about 20 tasks representing real usage. Early-stage changes have enormous effect sizes — a single prompt tweak might lift success rates from 30% to 80% — and differences at that scale are visible with just a few cases, no need to wait for hundreds.",
      "correct": true,
      "feedback": "Correct. The official postmortem directly calls out this delay excuse: teams often delay creating evals because they believe only large evals with hundreds of cases are useful, when it's actually best to start small-scale testing right away with a few examples; they themselves started with a set of about 20 queries representing real usage. The reasoning is effect size: early changes might lift success rates from 30% to 80%, and a gap that large is distinguishable with just a few cases."
    },
    {
      "id": "b",
      "text": "They have a point — waiting for the product to stabilize is indeed more efficient. Building an eval set while the product is still changing means cases quickly become obsolete; waiting until interfaces and flows are locked down makes it more cost-effective to build everything at once.",
      "correct": false,
      "feedback": "This reasoning has the sequence backwards. The phase when the product is changing is exactly when each change has the largest effect size and is most worth measuring; waiting until it's 'stable' means you've already made dozens of revisions without any ruler, and can't say which was better. Cases becoming obsolete is real, but the cost of rewriting a few cases is far lower than the cost of six months without measurement."
    },
    {
      "id": "c",
      "text": "Compromise: build 5 cases as a gesture, put them in the repo to show we have evals, but don't actually run them or make decisions based on the scores — save the real eval for later.",
      "correct": false,
      "feedback": "This pays the cost of building evals while gaining none of the benefit. The value of an eval set comes from actually running it after every change and actually looking at the scores. Cases that sit unused provide not even a reminder value. Either build a batch you'll run, judge, and actually let influence your decisions, or honestly acknowledge you're not doing it now — the worst option is the middle state."
    }
  ]
}
```

## Held-out sets: don't tune your prompt into "only good at these specific questions"

Suppose you dutifully built 20 cases and started tuning prompts. First version passes 8 cases, one revision passes 12, another passes 16, another passes 19. Great.

The problem: how much of that 19-case success comes from the agent genuinely getting stronger, and how much from you quietly embedding the characteristics of these 20 questions into the prompt? For instance, you notice case 7 keeps failing, so you add a line to the system prompt: "for return issues prioritize citing the 7-day no-questions-asked policy" — case 7 passes, but what you actually did was write the answer to that question.

This phenomenon is called **overfitting**: the model (or in this context, the entire prompt-plus-tools configuration) learns the features of the training material rather than the regularities of the task itself.

The tool engineering article's remedy is one sentence but critical: they relied on held-out test sets to ensure they didn't overfit to their "training" evaluations[^S3].

A **held-out set** is a batch of cases set aside from the start, that you don't look at, don't run, don't touch during day-to-day tuning. Its entire value comes from "not being contaminated." A few disciplines worth codifying in team agreements:

- **Run only at milestones.** Daily prompt tuning runs only the dev set (the "training" evaluations from the earlier quote — this lesson calls it the dev set, recorded as `dev` in the JSON field); run the held-out set only before a release or after structural changes (switching models, rewriting tool descriptions, changing the harness loop).
- **Look only at aggregates.** Check overall pass rate and the IDs of failed cases, don't open the full transcript of each failed held-out case to debug them one by one. Once you modify a prompt to fix a specific held-out case, that case has already become part of the dev set.
- **Retire if contaminated.** If you genuinely did tear open a few held-out cases while debugging an issue, merge them into the dev set and replenish with a fresh batch of held-out cases. The held-out set is consumable, not an heirloom.
- **Document who can access it.** Small teams often skip this. Agreeing "held-out set runs are executed by one person before releases, results are posted in the channel as a single score line" is far more effective than verbal promises of "everyone just be disciplined."

One common engineering practice worth mentioning: hooking evals into CI so every commit auto-runs the dev set, compares scores to the previous version, and blocks if the score drops. This is standard engineering practice, the orchestration depends on your pipeline, this course won't expand on it — Lesson 6 will build "the eval track that actually runs," and whether you connect it to CI is your choice.

## What automated evals miss, humans catch

Once the eval set is built, running, and scoring well, can you remove human testing?

No. The official postmortem is explicit: even in a world of automated evaluations, manual testing remains essential[^S2]. The reason is that people testing agents find edge cases that evals miss — including hallucinated answers on unusual queries, system failures, or subtle source selection biases[^S2].

The third category deserves special mention because it's so typical. Their human testers noticed: early agents consistently chose SEO-optimized content farms over authoritative but less highly-ranked sources like academic PDFs or personal blogs[^S2].

Pause and consider what this bias looks like. Each individual instance appears fine — the agent gives a cited, sourced, plausible-sounding answer. Fact-checking passes, citation format passes, completeness passes, and none of your scoring dimensions catch any issue (unless your rubric happens to include Lesson 4's "source quality" dimension and its criteria are sharp enough). But looking at a hundred outputs together reveals the pattern: it's systematically picking the easiest-to-find type of content.

Your eval set can't see this class of pattern in advance, because the eval set is written based on failure modes you **already know** — modes you haven't thought of naturally have no cases guarding against them. Manual testing doesn't replace evals, it **supplies new entries** for the eval set: every time you discover such a pattern, codify it into a case so it gets checked automatically next time.

Another class naturally belongs in the eval set: **behaviors the docs explicitly say are "not guaranteed."** The tool use documentation offers a good example — if the user's prompt doesn't include enough information to fill all required parameters for a tool, Claude Opus is much more likely to recognize that a parameter is missing and ask for it; but the docs immediately clarify that this behavior is not guaranteed, especially for more ambiguous prompts and for less capable models[^S6].

"Much more likely" and "not guaranteed" are signals: whether this holds in your scenario, you have to test yourself. Any behavior your product logic depends on but the docs only describe probabilistically is worth monitoring with a few cases on an ongoing basis.

## The eval set is a ruler: get the ruler first, then changes matter

Bringing this lesson back together.

The tool engineering article's sequence is: start by standing up a quick prototype of your tools and testing them locally, then run a comprehensive evaluation to measure subsequent changes[^S3]. Note "subsequent changes" — the eval isn't for giving the current state a score and calling it done, its value is **making all subsequent changes measurable**. With it, "this version of the prompt is better" shifts from a feeling to a conclusion.

The agent-building article goes further: as with any LLM features, the key to success is measuring performance and iterating on implementations; to repeat — you should consider adding complexity only when it demonstrably improves outcomes[^S1].

This statement carries weight when read with context. The techniques you learned in the earlier nine courses — multi-agent division of labor, memory systems, context compaction, checkpoint recovery — every single one adds complexity. Without an eval set, you can't answer "did adding this actually make things better," so you can only add by instinct, and adding by instinct means you keep adding. The eval set is the evidence that lets you **remove** a fancy design.

## How large is large enough: there's no numeric answer

Finally, a word on proportions.

I searched every primary source this course cites, and not one gives a threshold for "how many cases make an eval set sufficient." What exists is a starting scale (about 20 real queries) and a directional guideline (prioritize volume over per-case quality). So don't go looking for that number, and don't trust anyone who casually quotes "at least 50."

The real criterion is what this lesson opened with: **given the effect size of your current changes, can your existing cases still distinguish between them?**

- Change a version, passing count jumps from 6 to 15 — sufficient, keep going.
- Change a version, passing count wobbles between 17 and 18, and running twice gives different results — insufficient now, time to add cases or reduce noise in the grading method (revisit Lesson 4's judge consistency).
- The two approaches you want to compare differ by only one case — that's not a "which is better" question, it's a "your ruler can't resolve this difference" question.

Case count follows the need for resolution, not some psychological number.

As for how to actually run this batch of cases — one loop per task, how to layer grading, what to track besides pass rate — that's Lesson 6. What you need to take away from this lesson is the batch of cases itself.

## 💻 Exercises

<!-- exercises -->

### Level 1: Draft 10 eval cases for a customer support ticket assistant

Set a concrete agent: **customer support ticket assistant**. Its workflow is — read the user's message → call order-query tools (`getOrder` returns order status, tracking number, and whether it has shipped; `cancelOrder` cancels unshipped orders; `createEscalation` escalates to a human agent) → draft a reply.

Your task: draft 10 eval cases. No code required, a table or list works. Composition requirements:

- About 7 cases covering the real distribution (the kind of messages customer support actually receives daily)
- 2 edge cases
- 1 ambiguous case "where even human agents would struggle to reach consensus"

For each, write three components clearly: prompt summary, verifiable outcome, which type of verifier (deterministic / judge / both).

<!-- hint -->
Hint 1: Don't think about edge cases first, fill out the 7 "real distribution" cases first. The method is to ask yourself: if you pulled a day's worth of support tickets, what are the seven most frequent question types? Track shipment, return policy, change address, cancel order, request invoice… that kind. Once finished, go back and see which can be judged purely with string matching.

<!-- hint -->
Hint 2: To decide which verifier type a case needs, look at what its verifiable outcome looks like. If the outcome is "called a specific tool / reply contains or doesn't contain a certain string / order status changed to cancelled," use a deterministic verifier; if the outcome is "tone is appropriate" "all three requests were addressed" "didn't promise non-existent discounts," you need a judge. The two aren't mutually exclusive — one case can pass a deterministic hard check then go to a judge for a soft score.

<!-- rubric -->
Passing criteria:

1. Exactly 10 cases, composition meets requirements: about 7 real distribution, 2 edge, 1 ambiguous; each case is clearly tagged with which category it belongs to.
2. Each case has all three components: prompt summary, verifiable outcome, verifier type — none can be missing.
3. "Verifiable outcome" states an end state or observable evidence (tool calls, string presence/absence, order state change, rubric dimensions), not a process description like "agent should think before answering."
4. At least 5 cases can be judged with deterministic verifiers — demonstrating "automate grading when possible."
5. The 2 edge cases are genuinely low-frequency but realistically occurring situations (like missing information, mixed multiple requests), not purely fabricated gotchas.
6. The 1 ambiguous case explains "where the human disagreement point is," not just labeling it "this is hard."
7. Among the 7 real distribution cases, at least one requires multiple tool calls, not just one-question-one-answer.

<!-- answer -->
Reference answer (10 complete examples):

**Real distribution (7 cases)**

| # | Prompt summary | Verifiable outcome | Verifier |
|---|---|---|---|
| 1 | "Where is order SO-88101?" | Called `getOrder`; reply contains that order's tracking number and current status text | Deterministic (tool call assertion + string containment) |
| 2 | "How do I return something?" (no order number) | Reply contains return policy key points (time limit, original packaging, freight responsibility); did **not** call `getOrder` | Deterministic (keyword match + assert tool not called) |
| 3 | "Order SO-88213, I moved, can I change the address?" (order already shipped) | Called `getOrder`; reply states "already shipped" judgment and provides alternatives (refuse delivery / contact carrier for reroute); must not contain "changed for you" | Deterministic (hard checks) + Judge (tone appropriateness) |
| 4 | "Shows delivered but I didn't receive anything" | Called `getOrder` to confirm delivery record; called `createEscalation` to escalate to human; reply informs escalation and approximate timeframe | Deterministic (two tool calls + state change) |
| 5 | "Where do I get an invoice?" | Reply precisely contains invoice portal address and required information items | Deterministic (string containment, URL must be byte-exact) |
| 6 | "Want to cancel SO-88190 I placed last week" (order not yet shipped) | Called `cancelOrder`; order end state is cancelled; reply confirms cancellation and explains refund timing | Deterministic (tool call + end state assertion) |
| 7 | "Do I get a discount for buying two? Any coupons?" | Reply must not promise any non-existent discounts or coupons; should guide to current promotions page | Judge (whether fabricating offers, binary judgment) |

Case 4 requires at least two tool calls, satisfying "don't only test one-question-one-answer."

**Edge cases (2 cases)**

| # | Prompt summary | Verifiable outcome | Verifier |
|---|---|---|---|
| 8 | "Why hasn't my order moved yet" (entire message has no order number, time, or product name) | Reply contains an interrogative sentence asking for order number; did **not** call `getOrder` (must not guess an order number to query) | Deterministic (assert tool not called + interrogative detection) |
| 9 | One message packs three things: want to return one item + change address on another order + complain about last agent's attitude | All three requests are addressed, not one is missed; return and address-change each reach their respective judgment branches | Judge (completeness rubric: 3 items each scored) + Deterministic (tool calls cover both orders) |

Case 8 corresponds to the official docs' statement "the model will ask for missing parameters, but not guaranteed" — precisely because it's not guaranteed, it warrants ongoing monitoring.

**Ambiguous case (1 case)**

| # | Prompt summary | Verifiable outcome | Verifier |
|---|---|---|---|
| 10 | User is emotionally charged, product has minor defect but doesn't affect use, policy doesn't cover compensation, user is a high-frequency repeat customer, demands "immediate compensation" | Only enforce one hard rule: must **not** unilaterally promise a specific compensation amount or any compensation exceeding authorization; everything else (whether to issue a small goodwill coupon, whether to directly escalate to human, tone soft or firm) goes to judge for rubric scoring, and accept score volatility | Judge primarily + one deterministic red line |

Human disagreement point: some agents will immediately issue a small goodwill coupon to diffuse the situation, others will strictly follow policy to refuse and escalate to a supervisor. Both approaches have practitioners and detractors in real teams. This case's value isn't improving the overall score, it's reminding you that the "compensation authorization boundary" product rule isn't nailed down yet — scores wobbling on this case mean you should go ask product to set the rule, not keep tuning the prompt.

### Level 2: Design storage format and split scheme

Turn Level 1's 10 cases into a form a program can read, and plan how to divide them by purpose. No need to actually run them (that's Lesson 6).

Deliver three items:

1. **JSON structure**: Define fields for each case — `id`, `prompt`, `expected` (or a reference to a rubric), verifier type, `tags`. Provide at least 3 fully filled-in instances.
2. **Split scheme**: Divide the 10 cases into daily-tuning use and held-out set, write out the held-out set's usage disciplines (how often to run, what to look at, who runs it, under what conditions to retire).
3. **Two overfitting signals**: List two specific, observable signals indicating "we've already overfit."

<!-- hint -->
Hint 1: The `expected` field encounters a structural problem — deterministic cases expect "a set of verifiable assertions," judge cases expect "a rubric," and the two have different shapes. Don't force them into one field. A viable approach is letting `expected` hold only deterministic assertions, opening another field `rubricRef` pointing to a rubric file; the `verifier` field then allows `both`, meaning both gates must pass.

<!-- hint -->
Hint 2: When thinking about overfitting signals, don't stop at descriptions like "scores aren't real," ask "what specifically would I see in a monitoring dashboard?" Two directions to dig: one is the two sets' score trajectories diverging; the other is the prompt itself starting to contain content only meaningful to certain specific cases (hard-coded keywords, hard-coded order numbers, hard-coded phrasing).

<!-- rubric -->
Passing criteria:

1. JSON structure includes all required fields: `id`, `prompt`, `expected` or rubric reference, verifier type, `tags`; provides at least 3 fully filled instances, and instances match Level 1's cases.
2. Properly handles the problem that "deterministic expectations" and "rubric expectations" have different shapes (separate fields, or a union structure with `type`), didn't force rubrics into `expected`.
3. `tags` have practical use, can support at least one type of sliced viewing (like viewing pass rates by `distribution` / `edge` / `ambiguous` categories, or by involved tools).
4. Split scheme specifies which cases go into the held-out set and gives selection rationale; held-out set covers real-distribution cases, isn't composed only of edge/ambiguous cases (ambiguous cases already accept score volatility, shouldn't occupy gating signals).
5. Held-out set disciplines cover at least four points: timing of runs, what granularity of results to view, who executes, how to handle post-contamination.
6. Both overfitting signals are **observable**, state "which number to watch / which text to read," not abstract descriptions.
7. Explicitly notes that your split numbers are just this example's arrangement, not a universal threshold.

<!-- answer -->
Reference answer:

**1. JSON structure**

```json
{
  "version": 1,
  "agent": "cs-ticket-assistant",
  "cases": [
    {
      "id": "cs-001-track-order",
      "prompt": "Where is order SO-88101? Please help me check.",
      "verifier": "deterministic",
      "expected": {
        "mustCallTools": ["getOrder"],
        "mustContain": ["SO-88101", "tracking number"],
        "mustNotContain": ["unable to query"]
      },
      "rubricRef": null,
      "tags": ["distribution", "logistics", "tool:getOrder", "single-turn"],
      "split": "dev"
    },
    {
      "id": "cs-008-missing-order-id",
      "prompt": "Why hasn't my order moved yet, been waiting several days.",
      "verifier": "deterministic",
      "expected": {
        "mustNotCallTools": ["getOrder"],
        "mustMatch": ["(order number|order ID)", "[?？]"],
        "mustNotContain": ["queried for you"]
      },
      "rubricRef": null,
      "tags": ["edge", "missing-parameter", "not-guaranteed-behavior"],
      "split": "holdout"
    },
    {
      "id": "cs-010-goodwill-compensation",
      "prompt": "Item has corner damage, I've been buying from you for three years, this matter demands an explanation, compensate immediately!",
      "verifier": "both",
      "expected": {
        "mustNotMatch": ["(compensate|compensation|refund|reimburse)\\s*(you)?\\s*\\d+(\\.\\d+)?\\s*(yuan|dollars)"]
      },
      "rubricRef": "rubrics/cs-tone-and-authority.md",
      "tags": ["ambiguous", "policy-boundary", "human-disagreement"],
      "split": "monitor"
    }
  ]
}
```

Field explanations:

- `verifier` takes `deterministic` / `judge` / `both`. When `both`, run deterministic assertions first; if any fail, immediately fail without wasting a judge call (how to write this orchestration in code, see Lesson 6's track).
- `expected` only carries deterministic assertions; rubrics go in separate files, pointed to by `rubricRef`. This way rubrics can be reused by multiple cases, and changing a rubric doesn't require changing cases.
- `mustMatch` with multiple regex patterns means "all must hit, but mutual order not locked" — cs-008's two patterns only require the reply to contain "order number/order ID" and an interrogative sentence, doesn't matter which word comes first. Hard-coding word order (like requiring "order number" must appear before "please provide") would cause the most natural correct reply "Could you please provide your order number?" to fail, which is exactly Lesson 3's "verifier too strict" trap.
- `mustNotMatch` red-line regex is written by **missed-violation cost**: would rather write the character class wide (compensate/compensation/refund/reimburse/return all count), occasionally over-reporting for human review, than write it narrow and let through a real "compensate you 200 yuan." A red line's failure direction is opposite normal assertions — it would rather false-positive than let violations slip through.
- `rubricRef` explicitly writes `null` for purely deterministic cases, distinguishing absence from "doesn't need one."
- `split` takes `dev` / `holdout` / `monitor`: `monitor` is for ambiguous cases — doesn't count toward any pass rate, only used to watch for divergence (detailed in "Split scheme" below).
- `tags` carry at least one composition tag (`distribution` / `edge` / `ambiguous`) for viewing pass rates by category; also carry business tags and `tool:` prefix tags for locating "whether all cases involving getOrder failed together."

**2. Split scheme**

This example divides 10 cases into three portions: 6 for tuning, 3 held-out, 1 divergence monitoring. **This split is this example's arrangement, not a universal threshold**; the public materials give no standard answer for eval set size or split ratios.

- **Dev set (dev, 6 cases)**: #1, #2, #3, #5, #7, #9. Daily prompt tuning runs just this batch, the more frequently the better.
- **Held-out set (holdout, 3 cases)**: #4, #6, #8 — two real-distribution cases (including the only multi-tool-call case #4) plus one edge case.
- **Divergence monitoring (monitor, 1 case)**: #10. This is the "even humans struggle to reach consensus" ambiguous case, which already accepts score volatility, doesn't count toward any pass rate; independently watch how its judgment wobbles between versions, and if it wobbles significantly, go ask product to settle the rule.

Why the held-out set must span composition and must have real-distribution cases: the held-out set's top target is catching "overfitting to real distribution" — like writing into the system prompt "prioritize citing the 7-day no-questions-asked policy" to make a certain return case pass. A held-out set composed entirely of edge and ambiguous cases can't catch this, because it contains zero return/logistics-type real-distribution cases; and ambiguous cases don't converge themselves, occupying a third of gating signal only distorts readings. Conversely, putting #4, a heavy multi-turn tool-call case, into the held-out set also guards against "complex tasks being handled simplistically" regressions.

Usage disciplines:

- **When to run**: Only in three situations — before a release, after switching models or model versions, after structural changes to the harness loop or tool descriptions. Daily prompt tuning never runs it.
- **What to look at**: Only look at pass rate and the IDs of failed cases. Don't open the full transcript of failed cases, don't analyze failure causes case by case.
- **Who runs it**: Executed by the release lead, result posted to the team channel, only posting one line like "3 cases, 2 passed, failed cs-008."
- **Post-contamination handling**: If debugging a production issue genuinely required opening a held-out case's transcript and modifying the prompt based on it, permanently move that case into the dev set (change the `split` field), and simultaneously replenish the held-out set with a new case of the same type from recent real tickets. The held-out set is consumable.

**3. Two overfitting signals**

**Signal one: score trajectories of the two sets diverge.** Each time you run the held-out set, also record that day's dev set score. Healthy state is both improving together; seeing "dev set rose from 4/6 to 6/6, held-out set dropped from 2/3 to 1/3 (or stayed flat)" indicates recent prompt versions learned the features of those 6 questions, not the task itself. What to watch: passing counts from both sides, logged per release, direction continuously diverging is the alarm. One point to clarify: a 3-case held-out set only has 0/1/2/3 four readings, can't show "dropped a few percentage points" fine-grained trends, only sufficient to answer "have the last several releases been steadily regressing" — to plot a percentage curve, first expand the held-out set to dozens of cases, and how much to expand still follows resolution need, not some numeric threshold.

**Signal two: the prompt grows content only meaningful to specific cases.** Concrete manifestation is the system prompt or tool descriptions starting to contain hard-coded things — a specific order number, the user's exact phrasing from a case, a custom branch "when encountering X respond Y." Inspection method: read through the system prompt, line by line ask "if I removed this line, would only one eval case fail while real users have zero awareness?" Any line whose answer is "yes" grew from overfitting. Supplement with a quantifiable version: take a brand-new, never-been-in-any-set real ticket and run it; if it performs significantly below the dev set's average, the dev set's score no longer represents real capability.

<!-- /exercises -->

## Recap

- "Wait until we have hundreds of cases before building an eval set" is the most common delay excuse, which the official postmortem directly refutes: teams often delay creating evals because they believe only large evals with hundreds of cases are useful, when the right approach is to start small-scale testing right away with a few examples[^S2].
- Small sets genuinely work early on, the basis is effect size — a single prompt tweak might lift success rates from 30% to 80%, and a gap that large is distinguishable with just a few cases; they themselves started with a set of about 20 queries representing real usage patterns[^S2].
- Evaluation tasks should be grounded in real-world uses[^S3], mirror your real-world task distribution and factor in edge cases[^S5]; simultaneously avoid overly simplistic sandbox environments, as strong evaluation tasks might require multiple tool calls, potentially dozens[^S3].
- Structure questions to allow for automated grading (multiple-choice, string match, code-graded, LLM-graded)[^S5], and prioritize volume over quality — more questions with slightly lower signal automated grading is better than fewer questions with high-quality human hand-graded evals[^S5].
- Deliberately collect a category of ambiguous test cases where even humans would find it hard to reach an assessment consensus[^S5]: they aren't for boosting scores, they're for surfacing disagreements in the product rules themselves.
- Each evaluation prompt should be paired with a verifiable outcome, with verifiers ranging from exact string comparison to enlisting Claude as judge[^S3] — this connects directly to Lessons 2, 3, and 4.
- Held-out test sets prevent overfitting, relying on them to ensure you didn't overfit to your "training" evaluations[^S3]; the core disciplines are don't look at them daily, only look at aggregates, and retire them if contaminated.
- Automated evals have inherent blind spots: people testing agents find edge cases that evals miss, including hallucinated answers on unusual queries, system failures, and subtle source selection biases[^S2]; the real example is early agents consistently chose SEO-optimized content farms over authoritative but less highly-ranked sources like academic PDFs or personal blogs[^S2]. Even with automated evals, manual testing remains essential[^S2].
- Behaviors the docs explicitly say are "not guaranteed" naturally belong in the eval set, like whether the model will proactively ask for missing required parameters — the docs state this behavior is not guaranteed, especially for more ambiguous prompts and for less capable models[^S6].
- The eval set's value is making all subsequent changes measurable: run a comprehensive evaluation to measure subsequent changes[^S3]; success depends on measuring performance and iterating, complexity is only worth adding when it demonstrably improves outcomes[^S1].
- No primary source gives a numeric threshold for "how large is large enough." The criterion is: given the effect size of your current changes, can your existing cases still distinguish between them? When you can't distinguish, that's when to expand.

[>> Lesson 6: Hands-On: Build an Eval Track for Your Agent](./06-build-eval-harness.md)
