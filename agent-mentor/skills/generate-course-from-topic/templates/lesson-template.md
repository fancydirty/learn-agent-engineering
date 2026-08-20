# Lesson NN: <Lesson title>

> Lesson objectives:
> - …
>
> Prerequisites: <…> | Previous [<< NN-1](./NN-1-<slug>.md) | Next [NN+1 >>](./NN+1-<slug>.md)

## <This lesson's hook title — capture the tension/confusion unique to this lesson, don't default to "why this lesson matters">
…

## Explanation
…

<!-- Optional: only include right after covering a specific misconception/ordering that's worth an immediate check. Must be strict JSON; id unique within the course; prompt/feedback must be tied to this lesson, not a generic quiz. label must also name a specific action from this lesson (good: "judge whether payload signature invalidates"; bad: generic "will the signature change?"), the guard rejects generic labels. -->
```agentmentor-check
{
  "id": "<course-slug>-<lesson-slug>-<specific-check>",
  "label": "<2-6 word action name, tied to this lesson>",
  "prompt": "<ask about one specific judgment point from this lesson>",
  "whyHere": "<explain why a short interaction is needed here>",
  "copyPurpose": "<optional: the specific problem the user wants to resolve around this choice after copying it to an agent>",
  "mode": "single",
  "choices": [
    { "id": "a", "text": "<a common misconception>", "correct": false, "feedback": "<explain what mechanism it gets wrong>" },
    { "id": "b", "text": "<the correct judgment>", "correct": true, "feedback": "<explain why it holds>" }
  ]
}
```

<!-- Optional: process/dependency/causal ordering is better suited to agentmentor-order; at most 2 interaction blocks per lesson, don't stuff them into the exercise section. If you want the user to hand the current ordering to an agent for follow-up, write copyPurpose. -->

<!-- Optional: use agentmentor-predict when learners should predict an output/result first; at most 2 interaction blocks total per lesson. -->
```agentmentor-predict
{
  "id": "<course-slug>-<lesson-slug>-<specific-predict>",
  "label": "<2-6 word action name, tied to this lesson>",
  "prompt": "<have the learner predict what a piece of code/process will produce>",
  "whyHere": "<explain which just-covered mechanism this checks>",
  "language": "python",
  "snippet": "<the short code or process text to read>",
  "match": "normalized",
  "expected": "<the standard result>",
  "feedbackCorrect": "<explain why this result holds>",
  "feedbackWrong": "<point out the state/order/dependency most likely missed>",
  "copyPurpose": "<the specific problem the user wants to resolve around this prediction after copying it to an agent>"
}
```

<!-- Optional: use agentmentor-trace when learners should walk through variables/state/props/return values step by step. -->
```agentmentor-trace
{
  "id": "<course-slug>-<lesson-slug>-<specific-trace>",
  "label": "<2-6 word action name, tied to this lesson>",
  "prompt": "<which trace table should the learner fill in>",
  "whyHere": "<explain which state change this checks>",
  "language": "python",
  "snippet": "<the short code or process text to trace>",
  "columns": [
    { "id": "step", "label": "step" },
    { "id": "value", "label": "value" }
  ],
  "rows": [
    { "id": "start", "label": "start", "cells": { "step": { "answer": "-", "given": true }, "value": { "answer": "0", "given": true } } },
    { "id": "next", "label": "next step", "cells": { "step": "<standard answer>", "value": "<standard answer>" } }
  ],
  "feedbackCorrect": "<explain why the whole table holds>",
  "feedbackWrong": "<point out what to review for the most common mis-filled cell>",
  "copyPurpose": "<the specific problem the user wants to resolve around this table after copying it to an agent>"
}
```

<!-- Optional: only use agentmentor-code when "editing a small snippet exposes one conceptual judgment"; it only does local includes/notIncludes/regex checks, it does not execute code. -->
```agentmentor-code
{
  "id": "<course-slug>-<lesson-slug>-<specific-code-check>",
  "label": "<2-6 word action name, tied to this lesson>",
  "prompt": "<the specific task of filling in/editing a small snippet>",
  "whyHere": "<explain which just-covered judgment point this snippet checks>",
  "language": "css",
  "starter": "<starter code with indentation preserved>",
  "checks": [
    { "id": "core-rule", "type": "regex", "pattern": "<a compilable regex>", "message": "<explain the mechanism behind this rule>" }
  ],
  "copyPurpose": "<the specific problem the user wants to resolve around the current code after copying it to an agent>"
}
```

<!-- Optional: only use agentmentor-fix when "this short snippet has a typical mistake just covered, well suited to letting the learner fix it by hand"; it only does local includes/notIncludes/regex checks, it does not execute code. Write bug as the broken symptom, don't leak the full answer directly. -->
```agentmentor-fix
{
  "id": "<course-slug>-<lesson-slug>-<specific-bug-fix>",
  "label": "<2-6 word action name, tied to this lesson>",
  "prompt": "<which short snippet should the learner fix>",
  "whyHere": "<explain which just-covered judgment point this mistake checks>",
  "bug": "<the broken symptom or failure point, don't write out the full answer directly>",
  "language": "jsx",
  "starter": "<starter code containing the typical mistake>",
  "checks": [
    { "id": "core-fix", "type": "regex", "pattern": "<a compilable regex>", "message": "<explain the mechanism behind this rule>" }
  ],
  "copyPurpose": "<the specific problem the user wants to resolve around the current fix after copying it to an agent>"
}
```

<!-- Optional: only use agentmentor-diff when "a short 10-40 line diff can check whether the learner understood the key change"; it does not apply the patch or call Git. -->
```agentmentor-diff
{
  "id": "<course-slug>-<lesson-slug>-<specific-diff-read>",
  "label": "<an action name tied to this lesson's diff-reading, e.g. 'read the setState change'>",
  "prompt": "<what mechanism does this patch actually change?>",
  "whyHere": "<explain why the learner should judge the just-covered concept from the added/removed lines>",
  "language": "tsx",
  "focus": "<hint at which kind of addition/removal to look at, don't leak the correct choice directly>",
  "diff": "--- a/Example.tsx\n+++ b/Example.tsx\n@@\n-  <old code>\n+  <new code>",
  "choices": [
    { "id": "plausible-misread", "text": "<an explanation a real beginner would plausibly misread>", "correct": false, "feedback": "<explain why the diff doesn't show this mechanism>" },
    { "id": "mechanism", "text": "<the correct explanation>", "correct": true, "feedback": "<point out which added/removed line changed the mechanism>" }
  ],
  "copyPurpose": "<the specific mechanism the user wants to follow up on with an agent after copying this diff>"
}
```

<!-- Optional: only use agentmentor-hotspot when "a lightweight structure diagram can check whether the learner can point to the responsibility boundary/failure point/next-step node"; don't import arbitrary SVG, don't modify Mermaid. -->
```agentmentor-hotspot
{
  "id": "<course-slug>-<lesson-slug>-<specific-hotspot>",
  "label": "<an action name tied to this lesson's diagram-clicking, e.g. 'click the request boundary'>",
  "prompt": "<which key node should the learner click in the diagram>",
  "whyHere": "<explain why the just-covered relationship should be mapped onto the diagram here>",
  "layout": "flow",
  "nodes": [
    { "id": "start", "label": "<start node>", "x": 12, "y": 50 },
    { "id": "boundary", "label": "<key boundary node>", "x": 45, "y": 50 },
    { "id": "result", "label": "<result node>", "x": 78, "y": 50 }
  ],
  "edges": [
    { "from": "start", "to": "boundary", "label": "<relationship>" },
    { "from": "boundary", "to": "result", "label": "<relationship>" }
  ],
  "hotspots": [
    { "nodeId": "start", "correct": false, "feedback": "<explain why the start node isn't the responsibility boundary here>" },
    { "nodeId": "boundary", "correct": true, "feedback": "<explain why this node carries the key responsibility>" }
  ],
  "copyPurpose": "<the specific mechanism the user wants to follow up on with an agent after copying this click>"
}
```

## Worked example (follow along)
…

## Your turn (faded example)
…

<!-- Optional: only include if this lesson genuinely suits returning to the agent conversation. Note: this is a plain key/value field block, not JSON. label/description must be rewritten around this lesson's specific problem, don't use a fixed template name. -->
```agentmentor-action
mode: <mastery_probe | confusion_breaker | error_simulation | teach_back | pressure_scenario | reasoning_audit>
label: <write a learning action unique to this lesson, e.g. "rewrite with props three times to check whether I really understand where the data comes from">
description: <one sentence on which specific misconception from this lesson the agent will probe or simulate>
purpose: <the interaction goal the user wants to achieve after copying this to an agent>
rules:
  - Ask only one question or give only one small task at a time.
  - Point out specific blind spots based on my answer, don't give the full answer directly.
```

<!-- exercises -->
## 💻 Exercises (point these at your own real environment)

### Level 1 (warm-up)
<exercise prompt text>
<!-- rubric -->
- <completion criterion 1>
- <completion criterion 2>
<!-- answer -->
<key points of the solution>
<!-- hint -->
<first hint>
<!-- hint -->
<second hint>

### Level 2 (advanced)
<exercise prompt text>
<!-- rubric -->
- <completion criterion>
<!-- answer -->
<key points of the solution>
<!-- /exercises -->

## Summary + what's next
…

<!--
Exercise-section structure = language-independent HTML comment anchors (the parser keys on the anchors, not the heading text):
  <!-- exercises --> / <!-- /exercises --> wrap the entire exercise section (the heading text can be in any language).
  Within each exercise, place <!-- hint --> / <!-- answer --> / <!-- rubric --> before each hint/answer/rubric sub-section,
  with the content on the next line after the anchor; multiple hints = multiple <!-- hint --> anchors.
  ### Level N stays unchanged (already language-independent). When generating a course in a non-English language, the heading/body text follows the course language, but the anchors never change.
-->
