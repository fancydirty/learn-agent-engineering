# Learner Model Contract

This contract turns "know the audience" into a required course artifact. The goal is not more paperwork; it is to stop the authoring agent from quietly teaching a different person than the user named.

## Research Anchor

- [Carnegie Mellon Eberly Center, Assessing Prior Knowledge](https://www.cmu.edu/teaching/designteach/teach/priorknowledge.html): prior knowledge shapes how learners attend to, interpret, organize, remember, apply, and create new knowledge. Course design should therefore assess what learners already know and adjust coverage when prerequisite understanding is weak.
- [CAST UDL 3.0, Connect prior knowledge to new learning](https://udlguidelines.cast.org/representation/building-knowledge/prior-knowledge/): instruction should prime, activate, or provide prerequisite knowledge; unfamiliar background knowledge becomes a barrier when it is required for new information.
- [Carnegie Mellon Eberly Center, Learning Principles](https://www.cmu.edu/teaching/principles/learning.html): prior knowledge can help or hinder learning, and mastery requires component skills, integration practice, and knowing when to apply skills.
- [Carnegie Mellon Eberly Center, Lectures](https://www.cmu.edu/teaching/designteach/teach/instructionalstrategies/lectures.html): novices need cues, examples, and periodic summaries because new knowledge is a heavy working-memory load.

## Required Manifest Fields

Every `schemaVersion: 2` course manifest must include:

```json
"briefCompleteness": {
  "status": "user-provided | clarified | insufficient",
  "evidence": "What the user already provided, or what follow-up answer clarified the learner profile."
},
"learnerModel": {
  "targetReader": "Who this course is actually for, in one concrete sentence.",
  "knownConcepts": ["Concepts or tools the course may safely rely on."],
  "unknownConcepts": ["Concepts or tools the course must not treat as prerequisites."],
  "assumedEnvironment": "What the learner already has available, and what the course must not assume.",
  "firstIndependentAction": "The first action the learner can do without relying on unknownConcepts.",
  "noviceRamp": [
    "How the course bridges from knownConcepts into the first unknown concept.",
    "How commands, tools, diagrams, or exercises are introduced without hidden prerequisites."
  ]
}
```

`learnerBrief` can stay prose. `briefCompleteness` is the audit trail for "was there enough information to build the profile?" `learnerModel` is the audit trail that lets the next agent ask: "Did this course really teach that person?"

## Authoring Rules

1. If the user says they do not know X, put X in `unknownConcepts`; do not use X as a first-step prerequisite.
2. If the original request only names a topic, stop and ask 1-3 questions. Do not mark it `user-provided`; a delivered course must either be `clarified` or have a specific original request.
3. The first independent action must be executable using only `knownConcepts` plus information introduced in the same lesson.
4. For absolute beginners, use a familiar object or toy surface before the real professional workflow if the real workflow requires multiple unknown tools.
5. Introduce a term in this order: everyday handle -> visible example -> formal name -> glossary entry.
6. For technical commands, always state where to run it, what success looks like, and what to copy back to the agent on failure.
7. Keep total-beginner lessons to roughly 3-4 genuinely new concepts; the general hard cap remains about 5-6 before splitting.
8. Worked -> faded -> independent practice must respect the same learner model. A faded example is not allowed to require an unstated tool or term.

## Acceptance Rule

`agentmentor.json.acceptanceReview.learnerFitCheck` must answer:

- Which learner profile was used?
- What hidden prerequisites were removed or explicitly bridged?
- Why the first independent action is doable for that learner.

If this answer is vague, the course is not ready for `ship` or `examples/`.

## Public reader boundary

The open-course reader stores no learner profile, progress, notes, or review state. The learner model shapes authoring and acceptance only. When a learner copies a passage or exercise to an Agent, include the relevant course URL and inline context; never assume that Agent can read local course files or a hidden learning record.
