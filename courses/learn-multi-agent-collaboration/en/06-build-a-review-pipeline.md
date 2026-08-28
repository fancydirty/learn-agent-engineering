# Lesson 6: Hands-On: Building a Two-Agent Review Pipeline

> Learning goals:
> - Write a genuinely runnable producer-reviewer two-agent pipeline with the Claude API
> - Get the reviewer to return a structured, checkable review result instead of a blanket "looks fine"
> - Put a safety valve on the loop so the producer and reviewer don't polish back and forth forever
>
> Prerequisites: finish Lessons 1-5, be able to read basic JavaScript/Node.js, and have a working Claude API key | Previous: [Lesson 5 <<](./05-failure-and-coordination.md)

## First, the result: one full run

This is what you'll have running by the end of the lesson. You hand the terminal a task, and two agents take turns until the review passes or you hit the round limit:

```
$ node review-pipeline.js "Write an API change announcement for developers: the v2 endpoint changes the user_id field from a number to a string"

[Producer v1]
The v2 endpoint is here! Hugely improved experience — please switch to the new version soon.

[Reviewer round 1] Rejected. Issues:
- Doesn't spell out the specific field this change affects (never mentions that user_id goes from number to string)
- Gives no migration advice; developers don't know how to update their code
- "Hugely improved experience" is an unverifiable, exaggerated claim with no concrete basis

[Producer v2]
v2 API change notice: the user_id field type changes from number to string.
Check every piece of code that parses this field and switch the read logic from numeric to string,
to avoid parse failures caused by the type mismatch. This change takes effect in v2.1.0.

[Reviewer round 2] Approved

Final draft (approved in round 2):
v2 API change notice: the user_id field type changes from number to string.
Check every piece of code that parses this field and switch the read logic from numeric to string,
to avoid parse failures caused by the type mismatch. This change takes effect in v2.1.0.
```

The first version gets bounced by the reviewer, with reasons tied to each specific criterion; the producer revises into a second version, the reviewer looks again, and this time it passes. This is the **producer-reviewer** pattern from Lesson 4 turned into code: "one LLM call generates a response while another provides evaluation and feedback in a loop."[^S2]

## The overall shape: the same skeleton as an execution loop

If you took the course Agent Tool Calling: Getting Agents to Actually Do Things in this series, this pipeline's skeleton will look familiar: a loop, one judgment per round, a result that decides whether to keep going, plus a safety valve against infinite looping. The only difference is what the judgment judges — that course's tool-execution loop judges "does the model still want to call a tool" (the loop's semantics are in that course's lesson The Full Round-Trip of a Tool Call and its official sources), while here it judges "did the reviewer say it passed." Same skeleton, different contents in the loop body.

The whole pipeline is three functions stitched together: `runProducer` generates or revises the text, `runReviewer` scores it against criteria and gives specific notes, and `runPipeline` links the two into a loop with a round ceiling as the safety valve.

## Step 1: The producer — take the task, produce the text

On its first run the producer has only the task itself; on a second run after a rejection, it also carries the **full previous version** and the review notes, so the producer revises on top of the last version according to the notes rather than free-styling from scratch:

```js
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-5"; // swap in a model your account can call
const MAX_ROUNDS = 3; // safety valve: producer-reviewer polish at most 3 rounds, to avoid an infinite loop

async function runProducer(task, feedback, prevDraft) {
  const prompt = feedback
    ? `Task: ${task}\n\nYour previous version was:\n"""\n${prevDraft}\n"""\n\nThe reviewer rejected it with these notes:\n${feedback}\n\nRevise your previous version according to these notes. Return the full revised text only, with no extra explanation.`
    : `Task: ${task}\n\nReturn the text only, with no extra explanation.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content.find((b) => b.type === "text");
  return block ? block.text.trim() : "";
}
```

The producer's prompt is self-contained. As Lesson 3 covered, a subagent can't see what happened on the orchestrator's side, and it can't see how it was reviewed last time either[^S3]. So every call writes "what the task is," "what the previous version said," and "(if any) what last round's problems were" into this call's prompt verbatim. Notice that even the producer's own previous draft has to be passed back explicitly — this is the half of the self-contained principle that's easiest to miss: the Messages API is stateless, every request must carry the full history it needs, and the server keeps nothing between requests[^S8]. "Revise your previous version" only means something when the previous version was actually written into this prompt.

## Step 2: The reviewer — score against concrete criteria, no vague verdicts

The reviewer doesn't just ask the model "is this any good." As Lesson 5 covered, verification has to land on concrete, checkable criteria rather than an impression-based score[^S1]. Here the reviewer gets an explicit checklist and is required to reply in a fixed JSON format:

```js
const REVIEW_CRITERIA = [
  "Does it clearly state the specific field or endpoint this change affects (not just 'something changed' or 'better experience')?",
  "Does it give concrete migration advice, telling developers how to update their code?",
  "Is the whole announcement kept under 150 words?",
  "Are there any unverifiable, exaggerated claims (like 'hugely improved' with no concrete basis)?",
];

async function runReviewer(task, draft) {
  const prompt = `You are the reviewer. You only find problems; you do not rewrite. Task requirements: ${task}

Review criteria (check each one; do not give a vague verdict):
${REVIEW_CRITERIA.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Text to review:
"""
${draft}
"""

Reply strictly in the JSON format below, with no text outside the JSON:
{"approved": true or false, "issues": ["list each criterion that failed, with the specific problem for each; if all pass, give an empty array"]}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content.find((b) => b.type === "text");
  return block ? block.text.trim() : "{}";
}
```

Together, the `approved` and `issues` fields make up a **structured review result**: not a single "it's okay," but "pass or fail" plus "the specific problem behind each failed criterion." Once the producer has `issues`, it revises those specific problems instead of guessing where to go from a vague verdict.

## Step 3: Don't trust the review result blindly — treat a parse failure as a rejection

`runReviewer` returns a string, not an actual JSON object, so it still has to be parsed. Even though the reviewer is told to "reply strictly in JSON," without a structured-output constraint the model can still produce syntactically invalid JSON, drop fields, or wrap the JSON in a code block with a few lines of explanation around it[^S9]. The trap here is: what happens when parsing fails? Taking the lazy route — defaulting to letting it through on a parse failure — quietly turns a "the reviewer didn't do its job" failure into "review passed." That's exactly the point Lesson 5 made: output that "looks" finished isn't the same as output that's actually correct, and what you can't verify you shouldn't ship[^S6]. Here we do the opposite: a parse failure always counts as a **rejection**, never as a pass:

```js
function extractJson(raw) {
  // The model sometimes wraps JSON in a code block; try stripping the fence first
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : raw.trim();
}

function parseReview(raw) {
  try {
    const parsed = JSON.parse(extractJson(raw));
    if (typeof parsed.approved !== "boolean" || !Array.isArray(parsed.issues)) {
      throw new Error("field shape is wrong");
    }
    return parsed;
  } catch (err) {
    return {
      approved: false,
      issues: [`Reviewer did not reply in the agreed format. Raw content: ${raw.slice(0, 200)}`],
    };
  }
}
```

The `typeof parsed.approved !== "boolean"` and `!Array.isArray(parsed.issues)` lines extend the same idea — even when `JSON.parse` succeeds, you still confirm the parsed fields have the right shape, and a wrong field type also counts as a rejection. Don't let your guard down just because it's "at least valid JSON."

One aside: there's an official structured-outputs feature that guarantees, at the sampling level, that the response strictly matches a schema[^S9]. This lesson deliberately uses the "bare call plus your own defensive parsing" style so you feel firsthand that model output can't be trusted blindly; in production you can use structured outputs to remove this pothole entirely.

## Step 4: Wire it into a loop, add the safety valve

With `runProducer`, `runReviewer`, and `parseReview` in hand, `runPipeline` wires the three together, and `MAX_ROUNDS` is the only safety valve here — the producer and reviewer could in theory polish forever, so there has to be a ceiling:

```js
async function runPipeline(task) {
  let draft = await runProducer(task);
  console.log(`[Producer v1]\n${draft}\n`);

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const review = parseReview(await runReviewer(task, draft));

    if (review.approved) {
      console.log(`[Reviewer round ${round}] Approved`);
      return { draft, rounds: round, approved: true };
    }

    console.log(`[Reviewer round ${round}] Rejected. Issues:\n- ${review.issues.join("\n- ")}\n`);

    if (round === MAX_ROUNDS) {
      return { draft, rounds: round, approved: false, issues: review.issues };
    }

    draft = await runProducer(task, review.issues.join("\n"), draft);
    console.log(`[Producer v${round + 1}]\n${draft}\n`);
  }
}

const task =
  process.argv[2] ??
  "Write an API change announcement for developers: the v2 endpoint changes the user_id field from a number to a string";

runPipeline(task)
  .then((result) => {
    if (result.approved) {
      console.log(`Final draft (approved in round ${result.rounds}):\n${result.draft}`);
    } else {
      console.log(
        `Hit the max round count (${MAX_ROUNDS}) without passing review. Emitting the last version for human review:\n${result.draft}\n\n` +
          `Issues left unresolved in the last round:\n- ${result.issues.join("\n- ")}`
      );
    }
  })
  .catch((err) => {
    // The API call itself can also fail (network, auth, rate limit); don't swallow that silently either
    console.error(`Pipeline run failed: ${err.message}`);
    process.exitCode = 1;
  });
```

When it hits `MAX_ROUNDS` still un-passed, `runPipeline` doesn't force a "pass" verdict. It honestly hands over the last draft and the still-unresolved problems for human review — this too is Lesson 5's point applied at the closing step: when the result-integration stage runs into something it can't judge, it shouldn't paper over it by deciding for itself in code.

```agentmentor-check
{
  "id": "mac-zh-06-invalid-review-json",
  "label": "The reviewer didn't reply in the agreed format — what should you do",
  "prompt": "While running this pipeline, the reviewer one time doesn't reply in strict JSON and instead adds a line, \"Took a quick look, the content is basically fine,\" which makes `JSON.parse` throw. To keep the pipeline running, should you treat this parse failure as a passing review?",
  "whyHere": "\"Just treat it as a pass so the program keeps running\" is a tempting, low-effort move exactly when parsing fails; this is the spot to use Lesson 5's principle — \"output that looks reasonable isn't the same as output that's actually correct\" — to push that idea back, and to test whether you can apply that principle to code you write yourself",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Yes — the reviewer did say \"basically fine,\" so let it through and keep the pipeline from stalling",
      "correct": false,
      "feedback": "This is exactly the trust-then-verify gap Lesson 5 warned about. The reviewer not replying in the agreed JSON format means it didn't check each criterion against the standard this time, and a natural-language \"basically fine\" can't stand in for a structured review result. Treating a parse failure as a pass quietly repackages a \"the reviewer didn't do its job\" failure as \"review passed\" and serves it up."
    },
    {
      "id": "b",
      "text": "Yes — as long as the producer's text itself looks fine, the format the reviewer replies in doesn't matter",
      "correct": false,
      "feedback": "The reviewer's reply format is precisely the one signal the pipeline uses to decide \"pass or fail\" automatically. If the format can be ignored at will and still count as a pass, the review step is a hollow shell, and the structured review criteria you designed lose their meaning."
    },
    {
      "id": "c",
      "text": "No — a parse failure should count as a rejection; log the raw reply as an issue and retry, or escalate to a human",
      "correct": true,
      "feedback": "Correct. A wrong review-result format is itself a \"can't verify this\" situation, and by Lesson 5's principle, what you can't verify you shouldn't ship. That's how `parseReview` handles it in this lesson: a parse failure always returns `approved: false` and records the raw content as an issue, so the flow continues as a rejection instead of quietly letting it through."
    }
  ]
}
```

<!-- exercises -->
## 💻 Exercises

### Level 1: Get it running, then add a review criterion

Assemble this lesson's code into a `review-pipeline.js`, run `npm install @anthropic-ai/sdk`, `npm pkg set type=module`, set `ANTHROPIC_API_KEY`, and run this lesson's example task once. Confirm you see at least one "Rejected" round before you see "Approved." (If the producer's first version passes straight through, swap in a task that's easier to trip over — for example, deliberately ask for "a very short announcement" without saying how short.)

Once it runs, add a new criterion to `REVIEW_CRITERIA`: "Does the text mention the specific version number where the change takes effect?" Run it again and confirm the reviewer's `issues` now include a note tied to this new criterion.

<!-- rubric -->
- The pipeline actually runs, and the log shows the producer's first version plus at least one round of review notes
- The added review criterion really does change the review result — a draft missing that piece of information gets flagged
- You can explain what the pipeline ultimately outputs if it never passes and hits `MAX_ROUNDS` (not a crash, but handing over the last version and the unresolved problems)

<!-- answer -->
Add one more item to the `REVIEW_CRITERIA` array:

```js
const REVIEW_CRITERIA = [
  "Does it clearly state the specific field or endpoint this change affects (not just 'something changed' or 'better experience')?",
  "Does it give concrete migration advice, telling developers how to update their code?",
  "Is the whole announcement kept under 150 words?",
  "Are there any unverifiable, exaggerated claims (like 'hugely improved' with no concrete basis)?",
  "Does the text mention the specific version number where the change takes effect?",
];
```

You don't need to touch any code in `runReviewer` or `runPipeline` — the review criteria are spliced into the reviewer's prompt via a template string, so adding one array element means the reviewer checks the new full list, item by item, on its next call. If the producer's draft keeps failing to mention a version number, `issues` will carry a specific note for this criterion, and the producer revises to that note in the next round.

<!-- hint -->
If you find the producer's first version passes straight through and you never see a "Rejected" log line, the task is too easy for the producer to satisfy — try making the review criteria stricter, or adding a specific requirement to the task that the producer tends to miss on its first pass.

<!-- hint -->
When it hits `MAX_ROUNDS` still un-passed, look back at the last stretch of `runPipeline` — it doesn't throw and crash the program. It returns normally with `approved: false` plus the last draft and the issues list, leaving it to the calling code to decide what to do.

### Level 2: Break something on purpose, then fix it

The version of `parseReview` below has a problem. First explain the situation in which it would let a draft that was never really reviewed through as "approved," then give the fixed code.

```js
// The broken version
function parseReview(raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    return { approved: true, issues: [] };
  }
}
```

<!-- rubric -->
- Names the problem precisely: on a parse failure it returns `approved: true`, which treats a "the reviewer didn't reply in the agreed format" failure as "review passed"
- Explains the concrete consequence this brings (tying it to Lesson 5's "you can't trust it blindly" principle)
- The fix changes the parse-failure fallback to `approved: false` and records the raw content into `issues`, for triage or for a producer retry

<!-- answer -->
The problem is that the `catch` branch sets the fallback to `{ approved: true, issues: [] }`. Whenever the reviewer doesn't reply in JSON this time (even if it just added a line of small talk), `JSON.parse` throws, and the `catch` branch immediately marks a draft that "was never effectively reviewed" as "approved" and lets it through. This is exactly what Lesson 5 warned about: output that "looks" finished isn't the same as output that's actually correct, and a situation you can't verify shouldn't be taken as a passing result and shipped.

The fix is to make a parse failure always count as a rejection:

```js
function parseReview(raw) {
  try {
    const parsed = JSON.parse(extractJson(raw));
    if (typeof parsed.approved !== "boolean" || !Array.isArray(parsed.issues)) {
      throw new Error("field shape is wrong");
    }
    return parsed;
  } catch (err) {
    return {
      approved: false,
      issues: [`Reviewer did not reply in the agreed format. Raw content: ${raw.slice(0, 200)}`],
    };
  }
}
```

<!-- hint -->
Put yourself in the specific case where the reviewer "didn't reply in the agreed format" — if the fallback is "approved," that draft has been served up without any effective check at all, no different from the reviewer never running.

<!-- hint -->
To decide what the fallback should be, flip the question around: is a parse failure closer to "confirmed no problems," or to "can't confirm whether there's a problem"? Lesson 5's answer: if you can't confirm it, don't treat it as no-problem.

<!-- /exercises -->

## Recap

- The producer-reviewer pipeline's skeleton is the same thing as an execution loop: a loop, one judgment per round, a result that decides whether to keep going, plus a safety valve against infinite looping. The official definition of this pattern is exactly "one LLM call generates a response while another provides evaluation and feedback in a loop"[^S2] — here the judgment switches from "should a tool be called" to "did the reviewer say it passed."
- The producer's prompt is self-contained: every call writes the task, the full previous version, and (if any) last round's specific problems into the prompt verbatim — the Messages API is stateless, every request must carry the full history, and nothing is kept between requests[^S8], so you can't count on the model remembering what happened last round on its own[^S3].
- The reviewer scores against concrete, checkable criteria, item by item, and returns a structured `{approved, issues}` rather than a blanket verdict[^S1].
- What the reviewer returns can't be trusted blindly either — a parse failure or a wrong field shape should count as a rejection, not a quiet pass[^S6]; this principle applies not only to "trusting what a subagent says" but also to "trusting the data format a subagent returns."
- When it hits the max round count still un-passed, the pipeline should honestly hand over the last draft and the unresolved problems for human review, rather than deciding a pass for itself in code.

That's all six lessons of this course: from "why multiple agents," through how the orchestrator and subagents divide the work, how to write delegation prompts, which collaboration pattern fits which scenario, and how to handle failure, ending with building a working producer-reviewer pipeline by hand. The most worthwhile thing to do next isn't rereading the explanations — it's picking a small, real task you have on hand, dropping it into this pipeline skeleton, tweaking the review criteria, and running it to see whether it bounces the draft and how many times. Tuning the review criteria yourself once beats rereading the theory ten times.
