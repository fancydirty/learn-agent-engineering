# Lesson 6: Prompt Strategies for Different Tasks

> Learning goals:
> - Master the prompt best practices for code-generation tasks
> - Learn effective strategies for writing and summarizing documents
> - Understand prompt techniques for data analysis and extraction
>
> Prerequisites: [<< 05 Debugging and Improving Prompts](./05-debugging-prompts.md)

## Different tasks need different prompt strategies

You've learned the basic structure of a prompt, few-shot, CoT, and how to debug — those are general skills. But different kinds of tasks have their own quirks and traps, and they call for targeted strategies.

Code generation needs clear inputs, outputs, and edge cases; document writing needs a defined audience and tone; data extraction needs to handle missing values and keep the format consistent. This lesson walks through concrete techniques for three common task types.[^S12]

## Task type 1: Code generation

Code generation is one of the most common ways people use AI. The key is simple: **spell out the requirements clearly, and the AI can write code you can actually use**.[^S12]

### The six elements of a code-generation prompt

A good code-generation prompt should include:[^S12]

1. **Language and version**: Python 3.10, TypeScript 5.0
2. **Function signature**: input parameter types, return type
3. **Core logic**: what the function should do
4. **Edge cases**: how to handle empty input and error conditions — this is defensive programming: assume the input might be invalid and decide up front how to respond
5. **Code style**: comments, type hints, error handling
6. **Dependency limits**: standard library only, or which third-party libraries are allowed

### Comparison: vague vs clear code prompts

❌ **Fuzzy prompt**:
```
Write a Python function to process user data
```

The AI can only guess: what data? Process it how?

✅ **Clear prompt**:
```
Write a Python 3.10 function with these requirements:

Behavior:
- Input: a list of dicts, each with name (str), age (int), email (str)
- Output: drop users with age < 18, return the remaining users' emails (deduplicated)

Requirements:
- Include type hints
- Handle missing fields (if a dict is missing age or email, skip that user)
- Use the Python standard library only
- Include a docstring describing usage

Example:
Input: [{"name": "Alice", "age": 20, "email": "a@example.com"},
        {"name": "Bob", "age": 15, "email": "b@example.com"},
        {"name": "Charlie", "age": 25, "email": "a@example.com"}]
Output: ["a@example.com"]
```

This prompt nails down the input, output, edge cases, and code style, so the AI can write usable code on the first try.

There's research behind this: "prompts with explicit specifications reduced the need for back-and-forth refinements by 68%"[^S12] — spell out the details and you're far more likely to get code you can use straight away.

### Code-generation best practices

**Practice 1: Spell out the input and output data structures**

Don't say "process the data." Say "input is List[Dict[str, Any]], output is Dict[str, int]."

**Practice 2: Use examples to clarify edge cases**

```
Handle these special cases:
- Empty list input → return an empty list
- None value → skip it
- Duplicate value → keep the first occurrence
```

**Practice 3: Specify the code style**

```
Code style requirements:
- Use type hints
- Include a docstring (Google style)
- Don't over-comment (don't explain obvious code)
- Favor readability first, performance second
```

**Practice 4: Say what you don't want**

```
Don't:
- Don't use global variables
- Don't pull in external dependencies (standard library only)
- Don't write test code (main function only)
```

### Code-review prompts

When you ask the AI to review code, name the review dimensions explicitly:

```
Review the Python code below, focusing on:

1. Correctness: logic errors, edge-case handling
2. Performance: time-complexity analysis, possible bottlenecks
3. Security: SQL injection, XSS, input validation

Don't comment on code style or naming (those already pass lint checks).

For each issue you find, state:
- Location (line number or code snippet)
- Issue type (bug / performance / security)
- Concrete impact (under what conditions it breaks)
- Suggested fix

Code:
[paste code]
```

Name the review dimensions, and the AI won't waste time on details that don't matter.

## Task type 2: Writing and summarizing documents

Document work covers a lot: technical docs, meeting notes, article summaries, report generation.

### The key elements of document writing

1. **Target audience**: technical vs non-technical readers
2. **Purpose**: explaining how to use something vs persuading a decision-maker
3. **Tone and style**: formal vs casual, detailed vs concise
4. **Structure template**: which sections organize the content

### Comparison: document-summary prompts

❌ **Fuzzy prompt**:
```
Summarize this technical document
```

✅ **Clear prompt**:
```
You're a technical writer, good at turning complex technical docs into
summaries anyone can follow.

Task: summarize the API doc below as a quick-start guide for frontend
developers.

Audience: frontend engineers who know JavaScript but have never used this API.

Output format:
1. One sentence on what this API does
2. The three most-used features (for each: purpose + code example)
3. One complete usage-scenario example
4. Common mistakes and fixes (2-3)

Tone: direct and practical, no marketing speak.

Length: 800 words or fewer.

Original document:
[paste document]
```

This prompt nails the audience (frontend engineers), the purpose (quick start), the structure (four parts), and the tone (practical).

### Document-writing best practices

**Practice 1: Spell out the audience's background**

```
Audience:
- Role: product manager
- Technical level: doesn't code, but understands basic software-architecture concepts
- Reading goal: decide whether to adopt this approach
```

**Practice 2: Provide a structure template**

```
Organize it like this:

## Background
Why this approach is needed (1 paragraph)

## Options compared
| Option | Pros | Cons | Cost |
|--------|------|------|------|
| ...    | ...  | ...  | ...  |

## Recommendation
Which option to pick, and why (2-3 paragraphs)

## Risks
The main risks of this approach and how to handle them (list)
```

**Practice 3: Control the level of detail**

```
Level of detail:
- Explain each point in 1-2 sentences, don't expand
- Skip implementation details, cover business impact only
- Don't cite specific code or technical jargon
```

### Meeting-notes prompts

```
You're a project assistant, good at pulling the key points out of meeting
recordings or transcripts.

Task: write meeting notes from the transcript below.

Output structure:
1. Meeting info
   - Date: YYYY-MM-DD
   - Attendees: [list]
   - Topic: [one sentence]

2. Discussion (ordered by priority)
   For each item:
   - Problem statement (1 sentence)
   - Discussion points (2-3)
   - Decision (a clear conclusion; if none was reached, write "pending")

3. Action items
   For each:
   - Task description (start with a verb, actionable)
   - Owner
   - Due date

Constraints:
- Record only discussions with a clear conclusion, skip the chit-chat
- Every action item must be checkable (has a clear deliverable)
- Total length 500 words or fewer

Transcript:
[paste transcript]
```

## Task type 3: Data analysis and extraction

Data analysis covers pulling structured information out of text, classifying, filtering, and counting.

### The key elements of data extraction

A reliable data-extraction prompt spells out four things up front:

1. **Field definitions**: what each field means and its allowed range of values
2. **Missing-value handling**: what to do when a field can't be found
3. **Output format**: JSON, CSV, table
4. **Data validation**: whether the extracted data needs checking

### Comparison: data-extraction prompts

❌ **Fuzzy prompt**:
```
Extract the key information from this job posting
```

✅ **Clear prompt**:
```
Extract the following fields from the job posting and output JSON.

Field definitions:
- position (string): job title
- location (string): work location (city + district, if present)
- experience (string): experience required (keep the original wording, e.g. "3-5 years", "any")
- salary (string): salary range (keep the units, e.g. "20-30k/month", "negotiable")
- company (string): company name

Missing-value handling:
- If a field isn't in the source text, output null
- Don't guess or infer missing information

Example 1:
Input: Urgently hiring a Java engineer, Nanshan Shenzhen, 3+ years experience, 25-35k/month, XX Tech
Output:
{
  "position": "Java engineer",
  "location": "Nanshan, Shenzhen",
  "experience": "3+ years",
  "salary": "25-35k/month",
  "company": "XX Tech"
}

Example 2:
Input: Frontend developer, remote, salary negotiable
Output:
{
  "position": "Frontend developer",
  "location": "remote",
  "experience": null,
  "salary": "negotiable",
  "company": null
}

Now process:
[paste job posting]
```

The examples cover both the complete case and the missing case, so the AI knows to output null when it can't find something rather than making it up — that habit of confidently fabricating facts is called hallucination.

### Data-extraction best practices

**Practice 1: Spell out the allowed values for each field**

```
Field: sentiment
Allowed values: exactly one of "positive" / "negative" / "neutral"
Don't output: things like good, upbeat, favorable, or any other word
```

**Practice 2: Use few-shot to standardize the format**

When extracting structured data, 2-3 examples work better than a written description (the few-shot technique from Lesson 3).

**Practice 3: Say how to handle edge cases**

```
Special cases:
- If a passage carries mixed sentiment ("good product, but too expensive") → classify as "neutral"
- If it's a pure question ("how does this work?") → classify as "neutral"
- If the text is too short (fewer than 3 words) → output null
```

**Practice 4: Add data validation**

```
Validation rules:
- The salary field must contain a number
- If experience isn't null, it must contain "year" or "any"
- location can't be an empty string — either a value or null

If the extracted data fails a validation rule, return an error message
instead of the invalid data.
```

```agentmentor-check
{
  "id": "prompt-engineering-task-strategies-match",
  "label": "Match the task to the strategy",
  "prompt": "You want the AI to extract a product's pros and cons from user reviews and list each separately. Which strategy matters most?\n\nA: Use chain-of-thought so the AI shows its analysis\nB: Provide 2-3 examples showing how to pull pros and cons from a review and format them\nC: Explain in detail what counts as a pro and what counts as a con\nD: Ask the AI to play the role of a product analyst",
  "whyHere": "Checks whether you can pick the decisive strategy for an extraction task: here, few-shot examples beat a role or a written definition, because the hard part is a consistent input-to-output mapping, not reasoning or expertise.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "A - Use CoT to show the analysis steps",
      "correct": false,
      "feedback": "❌ CoT fits reasoning tasks (math, logic), but extracting pros and cons is pattern recognition, not multi-step reasoning. Walking through 'first find the positive words, then the negative ones' does little for extraction quality and just makes the output longer."
    },
    {
      "id": "b",
      "text": "B - Provide examples of extraction and formatting",
      "correct": true,
      "feedback": "✓ Right. The heart of an extraction task is getting the AI to grasp what counts as a pro, what counts as a con, and what format to output. Two or three good examples covering different cases beat a long written explanation — they let the AI see the input-to-output mapping directly."
    },
    {
      "id": "c",
      "text": "C - Explain the definitions of pros and cons",
      "correct": false,
      "feedback": "❌ A written explanation isn't as clear as an example. You can write a paragraph saying 'a pro is something the user thinks is good,' but one concrete example ('great quality' → pro) makes it far easier for the AI to grasp."
    },
    {
      "id": "d",
      "text": "D - Set the AI's role to product analyst",
      "correct": false,
      "feedback": "❌ A role does little for an extraction task. The difficulty here isn't an expert viewpoint but accurate recognition and formatting. A product analyst and an ordinary person judge 'great quality' as a pro the same way."
    }
  ]
}
```

## Applying the general principles

Whatever the task, the general principles from earlier lessons still hold:

- **The four elements** (Lesson 2): role, task, format, constraints
- **Few-shot** (Lesson 3): give 2-3 examples for complex tasks
- **CoT** (Lesson 4): add "let's think step by step" for tasks that need reasoning
- **Debugging** (Lesson 5): change one thing at a time, verify with test cases

The task-specific strategies in this lesson are **targeted optimizations** layered on top of those general principles:

- Code generation → emphasize input/output types, edge cases, what not to do
- Document writing → emphasize the audience's background, structure templates, tone
- Data extraction → emphasize field definitions, missing-value handling, few-shot examples

## Recap

Different tasks need different prompt strategies:

- **Code generation**: nail down input/output types, edge cases, code style, dependency limits; use examples to clarify special cases
- **Document writing**: define the audience's background and technical level, provide a structure template, control the level of detail and the tone
- **Data extraction**: define the allowed values for each field, say how to handle missing values, use few-shot to standardize the format, add data validation

These strategies build on the general skills from earlier lessons (the four elements, few-shot, CoT, debugging) — they're optimizations for specific task types. In practice, pick the combination that fits the task in front of you.

**Course wrap-up**

You've finished all six lessons of Prompt Engineering Basics:

1. Understood what a prompt really is and why it matters
2. Mastered the four core elements of a prompt
3. Learned to guide the AI with examples using few-shot
4. Applied chain-of-thought to make the AI show its reasoning
5. Built a systematic routine for debugging and improving prompts
6. Learned the specific strategies for different task types

Now you have the full toolbox. The next step is **practice**: pick a real task from your own work, apply these techniques, watch what happens, and keep refining. Prompt engineering is a skill you sharpen by doing — the coursework ends here, but the real learning starts when you put it to use.

<!-- exercises -->

## 💻 Exercises

### Level 1: Pick the right task strategy

Given three tasks, choose the most important strategy points for each and explain why.

**Task A**: Have the AI generate a Python function that implements binary search
**Task B**: Have the AI summarize a technical white paper into a 2-page report for management
**Task C**: Have the AI extract customer name, issue type, and urgency from a batch of customer emails

For each task, answer:
1. Which task type is this? (code generation / document writing / data extraction)
2. What are the 3 most important strategy points?
3. Why are those 3 points most important for this task?

<!-- rubric -->
- Correctly identifies each task's type
- The strategy points chosen for each task are specific (not generic all-purpose advice)
- Clearly explains why those strategies matter most for that task
- Accounts for what's special about the task (e.g. the audience shift in Task B, the format consistency in Task C)
- The strategy points come from what this lesson taught
<!-- answer -->
**Task A: Python binary-search function**

1. **Task type**: code generation

2. **Key strategies**:
   - Nail down the function signature: input type (a sorted List[int], target: int), return type (int — the index, or -1)
   - Spell out the edge cases: empty list, target not present, duplicate elements
   - Specify the code style: type hints, docstring, no line-by-line comments

3. **Why these matter**:
   - Binary search has several implementations (recursive vs iterative, half-open vs closed intervals); without specifics you don't know which one you'll get
   - Edge cases are where binary search is most bug-prone (off-by-one), so they must be stated
   - Algorithm code should be self-explanatory; over-commenting actually hurts readability

---

**Task B: technical white paper → management report**

1. **Task type**: document writing

2. **Key strategies**:
   - Define the audience: management (doesn't want technical detail, cares about business value and cost)
   - Provide a structure template: executive summary → business impact → cost-benefit → risks → recommendation
   - Control the level of detail: skip implementation details, swap jargon for business language, 2-3 sentences per point

3. **Why these matter**:
   - White paper to management report is a "translation" task; the biggest challenge is the audience shift
   - Management reads a report to make a decision, so the structure should center on "why do it, what does it cost, what are the risks"
   - Get the detail level wrong and it's either too technical (management can't follow it) or too thin (no basis to decide)

---

**Task C: extract structured info from customer emails**

1. **Task type**: data extraction

2. **Key strategies**:
   - Define the allowed values per field: issue type (product fault / billing question / feature inquiry), urgency (high / medium / low)
   - Use few-shot to standardize the format: 2-3 examples showing how to judge issue type and urgency from an email
   - Say how to handle missing values: if the email doesn't mention the customer's name, output "not provided" — don't guess from the email address

3. **Why these matter**:
   - Customers phrase things every which way; without examples showing the judgment criteria, the AI struggles to classify consistently
   - "Urgency" is a subjective call, and few-shot examples establish a shared standard (e.g. "system completely down" is high urgency)
   - Without missing-value handling, the AI might guess the customer name "Support" from "support@company.com" and corrupt the data

<!-- hint -->
Each task type has a different core challenge: code generation fears ambiguity (nail down the spec), document writing fears a mismatch (aim at the audience), data extraction fears inconsistency (standardize the format).
<!-- hint -->
When picking a strategy, ask: where is this task most likely to go wrong? Target that biggest pitfall with the matching strategy.

### Level 2: Design a complete task prompt

Pick one scenario below and design a complete prompt that pulls together everything the course taught.

**Scenario options**:

**Scenario 1**: Code-review assistant
- Have the AI review a piece of Python code for potential performance issues and security holes
- Output a structured review report, ordered by severity
- Each issue includes: location, description, suggested fix, priority

**Scenario 2**: Study-notes generator
- Give the AI a transcript of a technical lecture
- Generate structured study notes: core concepts, key points, practice tips, further reading
- Aimed at beginners, in plain language

**Scenario 3**: Customer-feedback analyzer
- Extract common issues from 10-20 pieces of customer feedback
- Output: issue categories, the frequency of each category, concrete examples, suggested improvement directions
- Used for product-iteration decisions

**Requirements**:
Your prompt must:
1. Include the four elements (role, task, format, constraints)
2. Provide 2-3 few-shot examples if examples are needed
3. Add CoT guidance if reasoning or analysis is involved
4. Account for edge cases and missing-value handling
5. Have a clear output format that's easy to use downstream

<!-- rubric -->
- The prompt is structurally complete, with the four elements it needs
- The task description is clear, with a defined audience and goal
- The output format is structured, with clear field definitions
- Includes appropriate examples or CoT guidance (matching the task type)
- Accounts for edge cases (e.g. "no issues found" in a code review, "poor-quality transcript" in study notes)
- The constraints are sensible and rule out unwanted output
- It's practical overall and ready to use on a real task
<!-- answer -->
**Scenario 1 example: code-review assistant**

````
[Role] You're a senior Python code-review engineer, focused on performance
optimization and security hardening.

[Task] Review the Python code below for potential performance issues and
security holes.

[Review dimensions] (by priority)
1. Security holes: SQL injection, XSS, unvalidated input, hardcoded secrets
2. Performance issues: algorithms above O(n^2), repeated computation, unnecessary memory use
3. Concurrency issues: race conditions, deadlock risk (if the code involves multithreading)

[Output format]
For each issue found, output in this format:

Severity: [high/medium/low]
Location: line X / function Y
Issue type: [security/performance/concurrency]
The problem: [detailed description, under what conditions it breaks]
Suggested fix: [concretely what to change, with a code snippet or approach]

---

[Constraints]
- Priority: security > performance > everything else
- Only flag issues that genuinely affect production; don't nitpick style
- If the code has no issues, output: "No high/medium-priority issues found. Code quality is good."
- Every fix suggestion must be concrete and actionable; don't say vague things like "improve the algorithm"
- Output at most 10 issues (ordered by severity)

[Code]
```python
[paste code]
```
````

**Why this prompt works**:
1. **Role + task**: senior engineer + a concrete review goal gives the AI a clear viewpoint
2. **Clear priorities**: the three dimensions are ordered by importance, so the AI knows where to focus
3. **Structured output**: five fields (severity, location, type, problem, fix) make it easy to process
4. **Edge-case handling**: the "no issues" case has a defined output, so the AI won't invent problems
5. **Clear constraints**: "don't nitpick style," "at most 10," "fixes must be concrete" keep the output from drifting
6. **Pulling it together**:
   - The four elements: role (review engineer), task (find issues), format (structured), constraints (priority + count)
   - Task-specific strategy: code review needs named review dimensions, location info in the output, and actionable suggestions
   - Edge cases: accounts for the "no issues" situation

<!-- hint -->
Steps for designing a combined prompt: (1) frame it with the four elements first, (2) add task-specific strategies based on the type (few-shot / CoT / format definition), (3) think through edge cases and add constraints, (4) check whether the output format is easy to use.
<!-- hint -->
Once you've designed it, read the prompt as if you were the AI: can you understand every requirement in one pass? Any fuzzy spots? Can the output format be copy-pasted straight into a report?

<!-- /exercises -->

