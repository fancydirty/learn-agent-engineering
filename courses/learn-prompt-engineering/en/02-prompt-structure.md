# Lesson 2: The Basic Structure of a Prompt

> Learning goals:
> - Master the four core elements of a prompt
> - Learn to turn a vague request into a structured instruction
> - Understand how each element shapes the AI's output
>
> Prerequisites: [<< Lesson 1: What a Prompt Is, and Why It Matters](./01-what-is-prompt.md) | Next: [Lesson 3 >>](./03-few-shot-learning.md)

## Why the AI keeps answering the wrong question

You ask the AI to "write a project summary" and it hands you a generic template with none of your project's actual details. Where did it go wrong? It isn't that the AI lacks the ability. Your instruction was missing the pieces that matter: what project is this, who's it for, what should it contain, and what format should it take.

An effective prompt isn't one line thrown over the wall. It's a complete instruction built from four elements. This lesson covers what those four elements are, what each one does, and how to combine them.

## The four elements of a prompt

A clear prompt usually contains four parts[^S2]:

1. **Role** — tell the AI what identity it should answer from
2. **Task** — state exactly what you want it to do
3. **Format** — specify the structure and style of the response
4. **Constraints** — set the boundaries: scope, length, tone, and so on

You don't need all four every time, but the more complex the task, the more elements it needs. Let's look at each one.

### 1. Role: what identity should the AI answer from

**Role** tells the AI what perspective and level of expertise to answer with[^S3]. The same question gets a completely different answer from a technical expert versus an elementary school teacher.

Compare these two prompts:

Without a role:
```
Explain what Docker is.
```

The AI might give you:
- A dictionary-style definition ("Docker is an open-source containerization platform...")
- An answer that assumes you already know Linux, virtualization, and images

With a role:
```
You are a teacher who's good at explaining technical concepts through
everyday analogies. Explain what Docker is to a product manager who has
no programming background.
```

Now the AI will:
- Reach for everyday analogies ("Docker is like a standardized shipping container...")
- Avoid jargon, or explain each term it uses
- Focus on "why you'd want it" rather than "how it's built"

**Common role patterns:**
- Professional identity: "You are a senior Python engineer"
- Teaching style: "You are a mentor who teaches through examples"
- Audience perspective: "You're explaining this to non-technical leadership"
- Tone: "You are a friendly, patient assistant"

### 2. Task: state exactly what you want done

**Task** is the heart of the prompt. It answers the "what do you want done" question[^S2]. A vague task description is the single most common problem.

Compare:

Vague task:
```
Analyze this code.
```

The AI has no idea which angle to take: performance? security? readability? bugs?

Clear task:
```
Analyze this Python code for performance bottlenecks. Point out which
operations could get slow with large datasets, and suggest how to fix them.
```

Now the AI knows:
- The focus is performance, not other concerns
- It should reason about the large-dataset case
- It shouldn't just flag problems, it should propose fixes

**A task has three layers:**
1. **Verb** — summarize, analyze, generate, edit, review...
2. **Object** — what content it acts on (code, a document, data...)
3. **Goal** — what result to reach, what problem to solve

### 3. Format: specify the structure of the response

**Format** tells the AI how to organize its answer[^S2]. With no format constraint, the AI picks whatever it thinks fits: maybe a wall of text, maybe a list, maybe a table.

Compare:

No format requirement:
```
Summarize the key points of this article.
```

The AI might give you:
- Three paragraphs of description
- A list of ten bullet points
- A single one-sentence takeaway

Specified format:
```
Summarize this article in this format:

Core argument: [one sentence]

Supporting evidence (3 points):
1. [point 1, one sentence]
2. [point 2, one sentence]
3. [point 3, one sentence]

Conclusion: [one sentence]
```

The AI will follow this structure exactly, and you can paste the result straight into your own document.

**Common format constraints:**
- Lists: "list three key points as bullets"
- Tables: "compare the pros and cons of both options in a table"
- Code: "output runnable code only, no explanation"
- Sections: "break it into background, analysis, and recommendation"
- Length: "keep each point under 50 words"

### 4. Constraints: set the boundaries

**Constraints** are the "don't..." and "only..." rules that keep the AI from wandering off track[^S2].

Compare:

No constraints:
```
Recommend some resources for learning Python.
```

The AI might give you:
- A dozen books, courses, and websites
- Everything from beginner to advanced
- A mix of paid and free, English and other languages

With constraints:
```
Recommend 3 resources for learning Python. Requirements:
- Completely free
- In English
- Suitable for absolute beginners
- Includes hands-on projects

Describe each resource in two sentences: the first says what it is, the
second says why it suits a beginner.
```

Now the AI will:
- Filter precisely for resources that fit
- Skip paid courses and off-language material
- Explain each pick in the format you asked for

**Common constraint types:**
- Length: "no more than 200 words"
- Scope: "only cover methods from 2023 onward"
- Tone: "use formal academic language"
- Exclusion: "don't include any paid options"
- Priority: "prefer open-source tools"

## Combining the four elements

A complete prompt brings all four elements together. Here's a real scenario.

**Scenario: have the AI draft meeting notes**

Task only, missing the other elements:
```
Write up notes from this meeting transcript.
```

All four elements:
```
[Role] You are an experienced project assistant.

[Task] Write meeting notes from the transcript below.

[Format] Organize it like this:
- Meeting basics (time, attendees)
- Issues discussed (ordered by priority)
- The decision reached on each issue
- Action items (owner + due date)

[Constraints]
- Only record discussions that reached a clear conclusion; skip small talk
- Every action item must be actionable (a verb + a checkable deliverable)
- Keep the whole thing under 500 words

Transcript:
[paste the transcript here]
```

This prompt is clear, complete, and reusable. Turn the transcript part into a placeholder and you have a template you can run again and again. Next meeting, you only swap in the new transcript.

```agentmentor-check
{
  "id": "prompt-engineering-structure-identify-element",
  "label": "Identify the missing prompt element",
  "prompt": "Which key element is missing from the prompt below?\n\n\"Please write me some JavaScript code that implements user login, using a JWT token for authentication.\"\n\nA: Missing role\nB: Missing task\nC: Missing format\nD: Missing constraints",
  "whyHere": "Spotting which element a prompt lacks is the first move in improving it. This prompt has a clear task but leaves the output shape unstated, which is exactly the trap beginners miss.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Missing role",
      "correct": false,
      "feedback": "❌ The task here is already specific (write JS, implement login, use JWT). For a code-generation task, role isn't the most important thing that's missing."
    },
    {
      "id": "b",
      "text": "Missing task",
      "correct": false,
      "feedback": "❌ The task is spelled out: write JavaScript, implement login, use a JWT token. That part is present."
    },
    {
      "id": "c",
      "text": "Missing format",
      "correct": true,
      "feedback": "✓ Correct. The prompt never says what form the code should take: a full file? just the core function? with comments? with error handling? The AI can only guess. Adding \"output only a runnable function, with full error handling and comments\" makes it clear."
    },
    {
      "id": "d",
      "text": "Missing constraints",
      "correct": false,
      "feedback": "❌ Constraints (like \"no external libraries\" or \"under 50 lines\") aren't required here. Their absence doesn't make the prompt fundamentally unclear."
    }
  ]
}
```

## Practice: rewriting a vague prompt

Now let's practice turning a vague prompt into a structured one.

### Original prompt (vague)
```
Optimize this code for me.
```

### Rewrite steps

**Step 1: pin down the task**
- Optimize for what? Performance, readability, or security?
- Say the goal is performance

**Step 2: add a role**
- A code reviewer's perspective fits best

**Step 3: specify the format**
- Structure the output: list the problems first, then the fixes

**Step 4: add constraints**
- Don't change the behavior
- Prioritize the obvious performance wins

### Rewritten prompt
```
You are a senior performance engineer.

Analyze the Python code below for performance problems and suggest fixes.

Output in this format:
1. Current bottlenecks (ordered by impact, largest first)
   - Description of the bottleneck
   - At what data volume it becomes a problem
2. Optimization plan
   - Specific change to make
   - The optimized code snippet
   - Expected performance gain

Constraints:
- Don't change the function's input/output interface
- Don't introduce new external dependencies
- Prioritize changes that give at least a 2x speedup

Code:
[paste the code here]
```

Compared to the original, the rewrite tells the AI clearly: what role to take, what to do, how to output, and under what limits.

## Using the four elements flexibly

The four elements aren't dogma, they're a checklist:

- **Simple tasks** can use just 2-3 elements: "Summarize this article's core argument in three sentences" (task + format)
- **Complex tasks** need all four: "You are a technical writer. Rewrite this API doc as a beginner-facing tutorial, with code examples and notes on common mistakes, under 1000 words"
- **Exploratory tasks** need fewer constraints: "What angles could we use to approach this problem?"
- **Execution tasks** need more constraints: "Output strictly in the following JSON format, with no explanation"

The test is simple: **after reading your prompt, can the AI know exactly what to do and what result to produce?** If you can't answer that clearly yourself, the AI has even less chance.

## Recap

An effective prompt contains four elements: role (what identity), task (what to do), format (how to organize), and constraints (what the boundaries are). You don't use all four every time, but the more complex the task, the more complete the set of elements it needs.

The rewrite process: pin down the core task first, then decide what role, what output format, and what constraints it needs. Expand a vague one-liner into a structured instruction and the quality of the AI's output rises sharply.

Next lesson covers few-shot learning: how to use 2-5 examples to make the AI understand the pattern you want, instead of describing it in words.

**Next lesson** [Few-Shot Learning: Guiding AI with Examples >>](./03-few-shot-learning.md)

<!-- exercises -->

## 💻 Exercises

### Level 1: Take a prompt apart and rebuild it

Here's a messy prompt:

```
Write a function, input is a list of strings, output is the deduplicated
result, make it fast, use Python, add comments.
```

Reorganize it using the four-element framework (role, task, format, constraints) so it's clearer.

<!-- rubric -->
- Role is set if the task calls for it
- Task is clear: input type, output type, core function
- Format is explicit: code style, comment requirements, whether an example is needed
- Constraints are reasonable: performance requirement, dependency limits, and so on
- The overall structure is clear enough for the AI to grasp every requirement in one read
<!-- answer -->
**Rebuilt prompt:**

```
[Task] Write a Python function that deduplicates a list of strings.

[Input/output]
- Input: List[str], may contain duplicate strings
- Output: List[str], deduplicated while preserving original order

[Requirements]
- Time complexity: O(n), implemented with a hash table
- Preserve original order of appearance (don't just set() then list(),
  which scrambles the order)
- Use the Python standard library only, no third-party dependencies

[Code style]
- Include type hints
- Include a docstring covering usage and time complexity
- No line-by-line comments inside the function (the code should be
  self-explanatory)

Example:
Input:  ["apple", "banana", "apple", "cherry", "banana"]
Output: ["apple", "banana", "cherry"]
```

**Why this is better:**
1. The task is cleanly split into input/output, requirements, and code style
2. The performance requirement is specific: not a vague "make it fast" but an explicit "O(n)" and an implementation method
3. It names a common trap: using set() directly scrambles the order
4. It gives an example, removing ambiguity
5. The code-style requirement is balanced: a docstring, but not over-commenting

<!-- hint -->
The original prompt crams every detail into one sentence, so nothing stands out. Try splitting it into a few paragraphs: state input/output first, then the performance requirement, then the code style.
<!-- hint -->
"Make it fast" is subjective; the AI doesn't know how fast you mean. Replace it with an objective standard: a time complexity, or "handle 1 million records in under a second."

### Level 2: Design a complete prompt for a complex task

Scenario: you need the AI to review a technical document (an API usage guide), find the spots where beginners are likely to get confused, and suggest improvements.

Design a complete prompt with all four elements.

<!-- rubric -->
- Role fits: technical writer, doc reviewer, or the target audience's perspective
- Task is specific: the review dimensions are clear (clarity, completeness, accuracy, etc.)
- Output format is structured: easy to review and act on item by item
- Constraints are reasonable: review priorities, aspects that don't need checking
- Edge cases are considered: how to handle the parts that have no problems
<!-- answer -->
**Example prompt:**

```
[Role] You are a technical documentation reviewer focused on making docs
beginner-friendly.

[Task] Review the API usage guide below and find the spots where a beginner
is likely to misread it or get stuck.

[Review dimensions] (ordered by priority)
1. Clarity: are terms explained, are examples complete and runnable
2. Completeness: are key steps missing, is error handling described
3. Ordering: does it follow a beginner's learning path (simple before complex)
4. Common traps: does it warn about mistakes that are easy to make

[Output format]
For each problem found, output:
- Location: which paragraph or code block
- Problem type: clarity / completeness / ordering / trap
- The specific problem: where a beginner would get stuck, and why
- Suggested fix: exactly what to change (1-2 sentences, don't rewrite the
  whole section)

[Constraints]
- Only flag problems that genuinely hurt a beginner's understanding; don't
  nitpick word choices
- Don't review the code's performance or security (this doc is for teaching,
  not production code)
- If a section is well written, just say "this part is clear" and move on
- Output at most 10 problems (the highest-priority ones)

Document:
[paste the document]
```

**Why this prompt works:**
1. **Role**: doc reviewer + beginner-friendliness focus gives the AI a clear perspective
2. **Task breakdown**: four review dimensions ordered by priority, so the AI knows where to focus
3. **Output format**: four structured fields, easy to process afterward
4. **Clear constraints**: it says what NOT to do (don't nitpick wording, don't review performance), which keeps the AI on track
5. **Edge handling**: it says how to handle the no-problem case, avoiding useless "this part is great" essays

<!-- hint -->
The key to designing a complex-task prompt: figure out which angles you want the AI to examine the problem from, then give each angle a priority. Don't let the AI decide for itself what matters.
<!-- hint -->
Design the output format around "how you'll use the result." If you'll edit the doc item by item, output "location + problem + fix." If you'll generate a report, output "summary + detailed list."

<!-- /exercises -->
