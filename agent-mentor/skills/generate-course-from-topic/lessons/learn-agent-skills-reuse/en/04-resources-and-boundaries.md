# Lesson 4: Resources, Scripts, and Execution Boundaries

> Goals for this lesson:
> - Tell apart the purposes of `references/`, `assets/`, and `scripts/`.
> - Judge whether a piece of content belongs in the instructions, the reference material, a template, or a script.
> - Do one resource layering pass on a real Skill folder — no programming required.
>
> Prerequisites: you understand the metadata layer, instruction layer, resource layer, and on-demand loading | Previous [<< 03](./03-progressive-disclosure.md) | Next [05 >>](./05-testing-and-safety.md)

## The resource layer needs boundaries too

Lesson 3 split long materials out of `SKILL.md`. But after the split, a new kind of mess appears: tag definitions, example files, blank templates, and check commands all sit together, and the agent cannot tell which are knowledge, which are shapes to copy, and which are actions that run reliably.

The same Markdown file can be a rule, a reference, or an output template, depending on how the agent should use it. The job here is to decide where each piece of content lands: stay in the instructions, be read by the agent, be copied and filled in, or be left to a deterministic script. Making that judgment does not require writing or running any script.

## Explanation

### `references/`: background material for the agent to read

`references/` suits long explanations, glossaries, tag definitions, review rules, and example analyses. Its trait is "read, then judge". The agent reads it to better understand the task's standards, not to copy it word for word.

In the interview-notes Skill, `references/tag-guide.md` can explain the three tags `pain-point`, `workaround`, and `buying-signal`, with a judgment example for each. It should not carry the final output skeleton, because the main purpose of reference material is to explain.

### `assets/`: shapes for the agent to reuse

`assets/` suits stable output shapes and static assets, such as blank notes, configuration templates, images, or data tables. Text templates do not need a separate `templates/` directory; put them straight into `assets/` with a file name that states the purpose. Both the open specification and OpenAI's current guide use this directory convention.[^S2][^S4]

If your interview notes always need the same four sections — summary, quoted evidence, themes, open questions — put that output skeleton into `assets/note-template.md`. The agent reads it when a fixed shape is needed, then fills it with the user's material.

### `scripts/`: room for deterministic operations

`scripts/` suits operations that are repeatable, rule-fixed, and produce checkable results. Examples: checking whether a Markdown file contains the required headings, converting a CSV to unified field names, or verifying whether a directory is missing a template. Official materials list scripts as one part a Skill can organize, and also remind you to audit dependencies, resources, and external network access before installation.[^S1][^S3]

This course does not ask you to write code. To judge whether a deterministic operation deserves a script, look at three things only: whether the rule is fixed, whether doing it by hand is error-prone, and whether the run result can be checked. If all three answers are clear, consider a script in the future; if the work still needs heavy semantic judgment, keep it in the instructions or the reference material.

### The determinism boundary: what not to hand to a script

The determinism boundary is the dividing line between "the machine executes by rule" and "the agent judges by meaning". Scripts are good at checking whether a heading exists, whether a file name matches, and whether a field is empty; the agent is good at judging whether a customer quote really supports a conclusion.

In interview notes, "check whether the output contains `## 原话证据`" can be a script; "judge whether this quote is a strong buying signal" fits reference material plus agent judgment better. Forcing semantic judgment into a script usually produces rules that look stable but are actually rigid.

Terms used in this lesson:

- `references/`: the reference directory for long background, rule explanations, and judgment standards.
- `assets/`: the static-resource directory for reusable templates, images, and data files.
- `scripts/`: the script directory for rule-fixed, repeatable, checkable operations.
- determinism boundary: the line between fixed-rule execution and semantic judgment.

## Complete example: assign four kinds of content for the interview-notes Skill

Suppose you are organizing this fictional Skill:

```text
interview-notes/
  SKILL.md
```

You have six pieces of content:

```text
1. When the user provides a transcript, output Chinese Markdown notes.
2. Do not modify the original transcript, and do not invent customer quotes.
3. Tag explanations for pain-point, workaround, buying-signal.
4. A fixed note skeleton.
5. Three fictional transcripts with matching good-note examples.
6. Check whether the output contains the three headings 摘要、原话证据、开放问题.
```

First assign the must-read rules. Items 1 and 2 must be obeyed on every run, so they stay in the `SKILL.md` body:

```markdown
## Instructions

When the user provides interview transcripts, produce Chinese Markdown notes.
Preserve quoted evidence and do not modify the original transcript.
Do not invent quotes that are not present in the source material.
```

Next assign the judgment standard that needs explanation. Item 3 is reference material:

```text
references/tag-guide.md
```

Its job is to help the agent judge tags, not to give the final note a fixed layout.

Then assign the reusable shape. Item 4 is a template:

```text
assets/note-template.md
```

The agent reads it when the user asks for a fixed structure and fills it with real content.

Item 5 can go into `references/examples.md`, because its main use is understanding what counts as a "good note". If the examples contain private information, they must not go into a public Skill; only public or fictional material may be used here.

Item 6 is the one that approaches the script boundary. Its rule is fixed, manual checking misses things, and the result can clearly report "which heading is missing". In the future it can live at:

```text
scripts/check-note-headings.js
```

But if you cannot program, writing it as a checklist in `references/quality-check.md` is fine for now. What matters is not inventing a dangerous script out of thin air, and never letting a script modify user files; get the boundary clear first.

Final structure:

```text
interview-notes/
  SKILL.md
  references/
    tag-guide.md
    examples.md
    quality-check.md
  assets/
    note-template.md
  scripts/
    check-note-headings.js
```

The `scripts/` here is a future location, not code this lesson asks you to implement right now. You should be able to explain why it is a deterministic check rather than semantic judgment.

```agentmentor-check
{
  "id": "agent-skills-reuse-deterministic-boundary",
  "label": "Pick the heading-check script",
  "prompt": "In the interview-notes Skill, which item is the best candidate for a future deterministic check in `scripts/`?",
  "whyHere": "The script boundary is the most misunderstood point of this lesson: not every task that looks repetitive belongs in a script.",
  "copyPurpose": "Have the agent check whether I mistook a semantic judgment for a deterministic script task.",
  "mode": "single",
  "choices": [
    {
      "id": "semantic",
      "text": "Judge whether a certain customer quote is a strong buying signal",
      "correct": false,
      "feedback": "That requires understanding context and evidence strength, so it suits reference material plus agent judgment."
    },
    {
      "id": "deterministic",
      "text": "Check whether the output contains the three headings 摘要、原话证据、开放问题",
      "correct": true,
      "feedback": "Whether a heading exists is a fixed rule with an easily checked result, so it suits a future script."
    }
  ]
}
```

## Half-finished example: put each piece of content in the right place

Below is the resource list of a release-notes Skill. Place each item into `SKILL.md`, `references/`, `assets/`, or `scripts/`.

```text
A. Given PR summaries as input, output user-facing Markdown release notes.
B. Do not create Git tags and do not run deployments.
C. Judgment explanations for "breaking change", "known issue", and "migration note".
D. The fixed release-notes structure: added, fixed, known issues.
E. Check whether the Markdown contains the second-level headings "Added" and "Fixed".
```

Complete:

```text
`SKILL.md`: ________________________________
`references/`: ________________________________
`assets/`: ________________________________
`scripts/`: ________________________________
```

Reference answer:

```text
`SKILL.md`: A, B. They are the core instructions and boundaries every task must obey.
`references/`: C. It explains judgment standards that the agent reads and understands.
`assets/`: D. It is a reusable output skeleton, suited to copy-then-fill.
`scripts/`: E. It is a fixed heading check with a clearly decidable result.
```

If you put C into a script, you turn semantic judgment into rigid keyword matching; if you write D at length into `SKILL.md`, the entry gets heavy.

<!-- exercises -->
## Exercises

### Level 1 (Warm-up)

Pick a Skill draft you have already written, list 8 pieces of content, and assign them to four categories: `SKILL.md`, `references/`, `assets/`, `scripts/`. You do not need to actually write a script; just state which content might be scripted in the future.

How: open your Skill draft or brief, and split every rule, example, template, and check item into a separate entry. Tag each entry with "must read every time", "read then judge", "copy then fill", or "fixed check".
<!-- rubric -->
- At least 8 pieces of content are listed.
- At least three of the four categories have content; if one category is empty, write one sentence explaining why.
- Every piece of content has a one-sentence assignment reason.
- At least one semantic judgment that does not suit scripting is called out.
<!-- answer -->
A passing answer puts "input, output, and the out-of-scope boundary" into `SKILL.md`, "term explanations and good/bad examples" into `references/`, "the fixed report skeleton" into `assets/`, and lists fixed checks like "does the heading exist, is the field empty" as future `scripts/` candidates. A common mistake is listing "judge whether the content has insight" as a script; that depends too much on meaning and should go back to reference standards plus agent judgment.
<!-- hint -->
Do not think about directory names yet; just tag each piece of content with one of the four labels.
<!-- hint -->
If a sentence contains "judge whether it truly supports the conclusion", it is usually not a deterministic script.

### Level 2 (Advanced)

Do one resource layering pass inside your real practice Skill folder. You may create empty files or draft files, but you must end with a readable directory: `SKILL.md` plus at least two resource files. Do not include private data, and do not write scripts that modify or delete files.

How: open the practice Skill folder in your IDE or terminal. Shrink the `SKILL.md` body to core instructions and resource pointers; create at least one `references/` file and one `assets/` file. If you think something suits a future script, create only a `scripts/README.md` stating the check goal — no executable code.
<!-- rubric -->
- The directory contains at least `SKILL.md`, one `references/` file, and one `assets/` file.
- The `SKILL.md` body contains resource pointers but no long reference material crammed in.
- The resource file names and content headings state their purpose.
- No real private material, no dangerous scripts, no commands that automatically modify user files.
<!-- answer -->
One passing directory: `SKILL.md`, `references/tag-guide.md`, `assets/note-template.md`, `scripts/README.md`. The `SKILL.md` says "read `references/tag-guide.md` when tag definitions are needed; read `assets/note-template.md` when a fixed output structure is needed." The `scripts/README.md` only records "a future check that required headings exist". Resource layering is done at that point, even without any executable script.
<!-- hint -->
In the real folder you can write very short placeholder content first, for example one heading and two lines of notes.
<!-- hint -->
If you feel like writing a script, rewrite it as one sentence describing the check goal; this lesson only requires a clear boundary.
<!-- /exercises -->

## Takeaway: a layered map where everything has its place

Once resource layering is done, the entry rules, reference material, output shapes, and fixed checks each have their place. The next lesson puts this layered map back onto real tasks, checking whether the Skill shows up when it should, stops when it should not take over, and whether the bundled files bring any risk.
