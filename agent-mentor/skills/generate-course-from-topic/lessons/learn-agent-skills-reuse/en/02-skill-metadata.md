# Lesson 2: SKILL.md Metadata Structure

> Goals for this lesson:
> - Write the minimal `SKILL.md` structure the open specification requires.
> - Tell apart the jobs of the metadata block and the body.
> - Make the `description` state both what the Skill does and when it triggers.
>
> Prerequisites: you have completed a four-line Skill brief | Previous [<< 01](./01-prompt-to-skill.md) | Next [03 >>](./03-progressive-disclosure.md)

## The agent does not see your full instructions first

You already have a four-line brief, but if you drop it into a random Markdown file, the agent will not necessarily know it is a Skill, or when to load it. Clients that support Agent Skills see the `name` and `description` first, and only read the full `SKILL.md` after a task matches.[^S1][^S4]

Step two is writing a minimal `SKILL.md` that passes static checks and triggers correctly in the agent. Longer explanations can wait until the entry point works.

## Explanation

### The minimal structure has only two layers

The open specification requires `SKILL.md` to contain YAML frontmatter followed by a Markdown body. The frontmatter needs at least `name` and `description`; the body holds the operating instructions the agent should follow once the Skill is activated.[^S2][^S7]

A minimal file looks like this:

```markdown
---
name: interview-notes
description: Turns customer interview transcripts into Chinese Markdown notes with quotes, themes, and product suggestions. Use when the user asks to summarize interviews, research calls, or transcript notes.
---

# Interview Notes

## Instructions

Read the transcript the user provides. Produce Chinese Markdown notes with:

- a short summary
- quoted evidence from the customer
- recurring themes
- 3 product suggestions

Do not edit the original transcript, send follow-up messages, or decide roadmap priority.
```

The frontmatter is the YAML metadata block at the top of the file, wrapped by two `---` lines. The body is the Markdown instruction after the frontmatter. The difference matters: the metadata helps the agent discover the Skill; the body helps the agent execute the Skill.

### `name` is a stable identifier

`name` is the machine-readable name of the Skill. The open specification requires 1 to 64 characters, only lowercase letters, digits, and hyphens, no leading or trailing hyphen, no consecutive hyphens, and it must match the parent directory name. Anthropic's current best practices give the same length and character limits.[^S2][^S7]

That means each of these names has a different problem:

```yaml
name: InterviewNotes      # has uppercase letters
name: interview_notes     # has underscores
name: -interview-notes    # starts with a hyphen
name: interview--notes    # consecutive hyphens
```

A valid name reads like a directory name:

```yaml
name: interview-notes
```

Do not aim for a clever name; aim for stable, short, and readable. It is not a title and not a slogan.

### `description` carries both capability and trigger

`description` is the short note the agent uses to decide whether to load the Skill. The spec requires it to be non-empty and at most 1024 characters, and recommends describing what the Skill does, when to use it, and including keywords that help the agent recognize the task. OpenAI's and Anthropic's current guides both rely on this field for implicit matching.[^S2][^S4][^S7]

A weak version:

```yaml
description: Helps write notes.
```

That sentence says nothing about input, output, or trigger scenarios. A more specific version:

```yaml
description: Turns customer interview transcripts into Chinese Markdown notes with quotes, themes, and product suggestions. Use when the user asks to summarize interviews, research calls, or transcript notes.
```

The first half states the capability; the second half states when to trigger. The four-line brief cannot be copied mechanically into the two locations: the capability, positive triggers, and necessary negative disambiguation go into the `description`; input details, full output requirements, and execution bans go into the body. If one "out of scope" item means the Skill should never be selected at all, compress it into negative disambiguation inside the `description`, and keep the concrete ban in the body.

Terms used in this lesson:

- `SKILL.md`: the required entry file inside a Skill directory, containing metadata and instructions.
- frontmatter: the YAML metadata block at the top of a Markdown file.
- `name`: the stable identifier that follows the naming rules and matches the parent directory.
- `description`: the short text that states what the Skill does and when it triggers.

```agentmentor-check
{
  "id": "agent-skills-reuse-description-trigger",
  "label": "Check the trigger description",
  "prompt": "Which description below is better at helping the agent decide when to load an interview-notes Skill?",
  "whyHere": "This step checks whether the learner wrote the description as a vague capability pitch instead of stating both the capability and the trigger.",
  "copyPurpose": "Have the agent check whether my description states both what the Skill does and when to trigger it.",
  "mode": "single",
  "choices": [
    {
      "id": "vague",
      "text": "Vague description: Helps with customer content.",
      "correct": false,
      "feedback": "It gives no stable input, output, or trigger keywords, so the agent can hardly judge when to load it."
    },
    {
      "id": "specific",
      "text": "Specific capability and triggers: Turns customer interview transcripts into Chinese Markdown notes with quotes and themes. Use when summarizing interviews, research calls, or transcript notes.",
      "correct": true,
      "feedback": "It states the capability, the output shape, and the trigger scenarios, which suits fast judgment at the metadata layer."
    }
  ]
}
```

## Complete example: a minimal checkable SKILL.md

Suppose the brief from the previous lesson is:

```text
Trigger: the user asks to organize customer interviews, user research transcripts, or sales call notes.
Input: one or more transcript texts, ideally with speakers and time order.
Output: Chinese Markdown notes with a theme summary, quoted customer evidence, a question list, and 3 product suggestions.
Out of scope: do not modify the original transcript, do not send email for the user, do not decide roadmap priority.
```

First create the directory name and the `name`:

```text
interview-notes/
  SKILL.md
```

Then write the minimal `SKILL.md`:

```markdown
---
name: interview-notes
description: Turns customer interview transcripts into Chinese Markdown notes with quoted evidence, themes, open questions, and product suggestions. Use when summarizing interviews, research calls, sales call notes, or transcript files.
---

# Interview Notes

## Instructions

Use this skill when the user provides or points to customer interview transcripts, research call notes, or sales call notes.

Input can be one or more transcript files or pasted transcript text. Preserve customer meaning and mark direct quotes clearly.

Return Chinese Markdown with:

- summary
- quoted evidence
- recurring themes
- open questions
- 3 product suggestions

Do not modify the original transcript, send follow-up messages, or decide roadmap priority.
```

It passes the most basic static checks because the frontmatter exists, the `name` is valid and matches the directory, the `description` is non-empty and carries both capability and trigger, and the body gives execution rules.

## Half-finished example: a release-notes SKILL.md

Complete the `name` and `description` from this brief:

```text
Directory name: release-notes
Trigger: the user asks to generate release notes from Git commits, PRs, or a changelog draft.
Output: user-facing Markdown release notes grouped by added, fixed, and known issues.
```

The half-finished file:

```markdown
---
name: __________________
description: __________________
---

# Release Notes

## Instructions

Write user-facing Markdown release notes from the change material the user provides.
```

Reference answer:

```yaml
name: release-notes
description: Turns commits, PR summaries, or changelog drafts into user-facing Markdown release notes grouped by features, fixes, and known issues. Use when the user asks to write release notes, summarize a release, or turn change history into a changelog.
```

Note that the `description` does not need to pack in every operational detail. Its first job is to help the agent judge "should this task load me".

<!-- exercises -->
## Exercises

### Level 1 (Warm-up)

Next to one of your own real working directories, create a practice directory such as `skill-drafts/<your-skill-name>/`, and write a minimal `SKILL.md` for the brief from the previous lesson. Do not include private data; write only structure and instructions.

How: first rename the directory to lowercase kebab-case, then make `name` exactly equal the directory name. Compress the brief's capability, positive triggers, and necessary negative disambiguation into one `description`; put the input details, full output requirements, and execution bans into the body.
<!-- rubric -->
- The file is named `SKILL.md` and starts with frontmatter.
- `name` uses only lowercase letters, digits, and hyphens, and matches the parent directory name.
- `description` states what it does, when it triggers, and any truly necessary negative disambiguation.
- The body states at least the input details, the full output requirements, and the execution bans.
<!-- answer -->
A passing answer starts with valid multi-line frontmatter:

```markdown
---
name: release-notes
description: Turns ... Use when ...
---
```

Then come the Markdown Instructions. A common mistake is a directory called `ReleaseNotes` while `name` says `release-notes`; the open specification requires the two to match.
<!-- hint -->
Check only the first three frontmatter lines first; do not rush to polish the body.
<!-- hint -->
If you cannot write the description, merge the "trigger" and "output" lines from the previous lesson into one short sentence.

### Level 2 (Advanced)

Write three representative user requests for the same Skill, and check whether your `description` would cause a false trigger or a missed trigger. At least one request should be an adjacent task that must not trigger.

How: create a `trigger-cases.md` draft in the practice directory, listing "should trigger 1", "should trigger 2", and "should not trigger 1". Compare each request against the keywords and boundaries in your `description`.
<!-- rubric -->
- All three requests sound like things a real user would say.
- At least two should-trigger requests find matching keywords or semantics in the description.
- The should-not-trigger request is excluded by the scope words in the `description`; the body has a matching banned action.
<!-- answer -->
Take `release-notes`: "write release notes from these PRs" should trigger; "turn this changelog into a version users can understand" should trigger; "tag the Git release and publish to production for me" should not trigger. If the `description` only says "Helps with releases", the third request is easily misjudged; narrow the scope to "write release notes" and state explicitly "Do not use for tagging, deployment, or publishing operations". The body then says "do not create tags, do not run releases", which constrains execution when the Skill is already loaded or the user sends a mixed task.
<!-- hint -->
Write the requests as things a user would actually say, not as spec fields.
<!-- hint -->
Adjacent tasks usually contain actions like "send, publish, deploy, modify source files, decide priority".
<!-- /exercises -->

## Takeaway: the two jobs of metadata

The minimal `SKILL.md` now has two jobs: the frontmatter handles discovery and selection, and the body handles actual execution. Once the entry point works, a new problem appears — materials keep growing longer; next you will let the agent read tag definitions, examples, and templates only when the task needs them.
