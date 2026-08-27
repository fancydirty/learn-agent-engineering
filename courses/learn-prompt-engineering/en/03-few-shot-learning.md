# Lesson 3: Few-Shot Learning: Guiding AI with Examples

> Learning goals:
> - Understand the difference between zero-shot, one-shot, and few-shot
> - Learn to use 2-5 examples to make the AI grasp a pattern
> - Master the principles for choosing high-quality examples
>
> Prerequisites: [<< Lesson 2: The Basic Structure of a Prompt](./02-prompt-structure.md) | Next: [Lesson 4 >>](./04-chain-of-thought.md)

## When a description is less clear than an example

You want the AI to output data in a specific format — say, "pull the key facts out of this article and return them as JSON." You spend a while in the prompt spelling out field names, data types, nesting... and the AI still hands back something shaped differently from what you pictured.

Try another way. Stop describing the format and **show the AI 2-3 clean examples instead**. It reads them, sees exactly what you want, and gets the format right on the first try. That's the power of few-shot learning: an example is clearer than a paragraph of description[^S11].

## What few-shot learning is

**Few-shot learning** is a prompt technique that guides the AI toward the pattern you want by placing a small number of examples (usually 2-5) in the prompt[^S4][^S11]. The AI learns the input-output relationship, the format, and the style from those examples, then applies it to a new input.

Three ways to compare:

- **Zero-shot**: no examples, just an instruction[^S15]
- **One-shot**: one example
- **Few-shot**: 2-5 examples[^S4]

### Zero-shot: instruction only

Zero-shot prompt:
```
Classify the user review below as "positive", "negative", or "neutral".

Review: This product works fine, but it's a little expensive.
Classification:
```

The AI might return:
- "neutral" (reasonable)
- "negative" (because it mentions "expensive")
- "positive with reservations" (a category it invented on the spot)

With no examples, the AI can only lean on its own judgment for the edge cases.

### Few-shot: give it examples

Few-shot prompt:
```
Classify user reviews as "positive", "negative", or "neutral".

Examples:

Review: The build quality is great, I'm really happy with it.
Classification: positive

Review: Completely unusable, a waste of money.
Classification: negative

Review: The features are okay, but customer support is slow.
Classification: neutral

Now classify this review:

Review: This product works fine, but it's a little expensive.
Classification:
```

After seeing the examples, the AI understands:
- "positive" is for a fully satisfied review
- "negative" is serious dissatisfaction
- "neutral" is a mixed review, some good and some bad
- the output is a single word, with no explanation

So it returns "neutral", because this review matches the pattern of the third example.

## How few-shot learning works

Few-shot learning taps into a large language model's **in-context learning** ability[^S4]. The model isn't retrained; it just sees a few examples in the current conversation, infers the rule, and applies it.

The model picks up three kinds of information from the examples:

1. **The input-to-output mapping**: which kind of input produces which kind of output
2. **The output format and style**: a short answer or a detailed one, JSON or plain text
3. **The standard for edge cases**: how an ambiguous case should be classified

**A key finding**: research shows that the **format** and **diversity** of the examples matter more than whether every example is correct[^S4]. Even if a few labels in the examples are wrong, the AI can still learn a useful pattern, as long as the format is consistent and the examples cover different kinds of input.

## Principles for designing high-quality examples

You can't just throw in any few examples. The quality of your examples directly shapes the AI's output[^S11].

### Principle 1: at least 2, and usually no more than 5

- **One example** (one-shot) is sometimes not enough — the AI may treat it as a special case
- **2-3 examples** are usually plenty for the AI to grasp the pattern
- **4-5 examples** are for more complex tasks, or ones with lots of edge cases
- **More than 5** gives diminishing returns and eats a fair number of extra tokens

Start with 2, and add a third or fourth only if the results aren't good enough[^S11].

### Principle 2: examples should be representative and diverse

Your examples should cover the different kinds of input the task might see — that is, example diversity[^S4].

Examples that lack diversity:
```
Example 1: iPhone 15 Pro → phone
Example 2: iPhone 14 → phone
Example 3: iPhone 13 → phone

Now classify: MacBook Pro
```

Every example is a phone. The AI has never seen another kind of electronic product, so it may not know how to handle one.

Examples with diversity:
```
Example 1: iPhone 15 Pro → phone
Example 2: MacBook Air → laptop
Example 3: AirPods Pro → headphones

Now classify: iPad Pro
```

This covers different product categories, so the AI can learn a more general classification logic.

### Principle 3: keep the format identical across examples

Format consistency is the key to a successful few-shot prompt[^S4].

Inconsistent format:
```
Example 1:
Input: What a nice day
Output: positive

Example 2:
"This movie was so boring" --> negative sentiment

Example 3: it's okay → neutral
```

The format is all over the place, so the AI doesn't know whether to output "positive", "positive sentiment", or something else.

Consistent format:
```
Example 1:
Input: What a nice day
Output: positive

Example 2:
Input: This movie was so boring
Output: negative

Example 3:
Input: it's okay
Output: neutral
```

Clean and uniform, so the AI knows the output should be a single adjective.

### Principle 4: include edge cases and easily-confused examples

If the task has gray areas, put them in the examples[^S11].

**Scenario: judging whether a code comment is useful**

Only the obvious examples:
```
Example 1:
Code: x = x + 1  # add 1
Verdict: useless (the comment just repeats the code)

Example 2:
Code: result = calculate_tax(income, deductions)  # compute tax owed
Verdict: useful (explains the business meaning)
```

With edge cases included:
```
Example 1:
Code: x = x + 1  # add 1
Verdict: useless (the comment just repeats the code)

Example 2:
Code: result = calculate_tax(income, deductions)  # compute tax owed
Verdict: useful (explains the business meaning)

Example 3:
Code: time.sleep(2)  # wait for the API rate limit to reset
Verdict: useful (explains why we wait, which isn't obvious)

Example 4:
Code: users = users.filter(active=True)  # filter active users
Verdict: useless (the method name already makes this clear)
```

Examples 3 and 4 help the AI see the boundary: not every comment that "explains what the code does" is useful. What matters is whether the code already expresses its intent clearly on its own.

```agentmentor-check
{
  "id": "prompt-engineering-few-shot-example-quality",
  "label": "Judge whether the examples cover diverse cases",
  "prompt": "You want the AI to turn product reviews into structured JSON (with a score, pros, and cons). Which set of examples is better?\n\nA:\nExample 1: Great product → {\"score\": 5, \"pros\": [\"good quality\"], \"cons\": []}\nExample 2: It's okay → {\"score\": 3, \"pros\": [], \"cons\": []}\n\nB:\nExample 1: Good quality, but a bit pricey → {\"score\": 4, \"pros\": [\"good quality\"], \"cons\": [\"expensive\"]}\nExample 2: Fast shipping, packaging intact, product as described → {\"score\": 5, \"pros\": [\"fast shipping\", \"good packaging\", \"as described\"], \"cons\": []}\nExample 3: Too few features, not worth the price → {\"score\": 2, \"pros\": [], \"cons\": [\"few features\", \"poor value\"]}",
  "whyHere": "You just learned that good examples are diverse and match the real task. This check catches the tempting instinct to keep examples short and simple — which quietly fails to show the AI how to handle the multi-point reviews it will actually see.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "A is better, because the examples are short and don't waste tokens",
      "correct": false,
      "feedback": "❌ Short isn't the same as effective. A's examples are too simple (\"Great product\", \"It's okay\") and never show how to pull multiple pros and cons out of a complex review. Real reviews usually carry several points, and A doesn't cover that case."
    },
    {
      "id": "b",
      "text": "B is better, because the examples are closer to real reviews and cover different cases",
      "correct": true,
      "feedback": "✓ Correct. B shows three cases: pros and cons together (example 1), pros only (example 2), and cons only (example 3). Each one is also close to a real review in complexity, with several points packed in. The AI can learn how to handle the actual task from these."
    }
  ]
}
```

## Worked example: extracting structured data with few-shot

The most common task here is pulling structured data out of unstructured text.

### Task: extract key fields from a job posting

Zero-shot version (unreliable):
```
From the job posting below, extract: job title, salary range, location,
experience required. Return it as JSON.

Job posting: We're hiring a senior Python developer, based in New York,
3-5 years of experience, $140-160k per year.
```

The AI might return all sorts of formats:
```json
{"title": "Python developer", "pay": "140-160k", ...}
```
or
```json
{"job": "senior Python developer", "salary": "$140-160k/yr", ...}
```

Field names, format, and units are all inconsistent.

Few-shot version (stable format):
```
Extract the key fields from a job posting and return them in the JSON
format below.

Example 1:
Input: Hiring a frontend engineer, San Francisco, 2-3 years experience,
$120-150k per year
Output:
{
  "position": "frontend engineer",
  "location": "San Francisco",
  "experience": "2-3 years",
  "salary": "$120-150k/year"
}

Example 2:
Input: Urgent: Java backend, Austin (downtown), 5+ years required,
$8-10k per month
Output:
{
  "position": "Java backend",
  "location": "Austin (downtown)",
  "experience": "5+ years",
  "salary": "$8-10k/month"
}

Example 3:
Input: Data analyst, remote, experience open, $60-80 per hour
Output:
{
  "position": "data analyst",
  "location": "remote",
  "experience": "open",
  "salary": "$60-80/hour"
}

Now handle this one:
Input: We're hiring a senior Python developer, based in New York, 3-5 years
of experience, $140-160k per year.
Output:
```

The examples cover three salary units (per year, per month, per hour) and three location types (city, city plus area, remote), so the AI learns:
- use English field names
- keep the salary unit from the original text
- keep the detail when extracting the location
- "open" is a valid experience requirement too

## Common few-shot traps

### Trap 1: too few examples, incomplete coverage

Give just one example and the AI sees a single instance, not a rule.

**Fix**: at least 2, ideally 3.

### Trap 2: inconsistent format between examples

An arrow → here, a colon : there, multiple lines somewhere else.

**Fix**: pick one format and follow it strictly in every example.

### Trap 3: all easy cases, no edge cases

Real data has noise, ambiguity, and gaps. If the examples only show the ideal case, the AI stalls the moment it hits an edge case.

**Fix**: at least one example should include an edge case (a missing field, an ambiguous phrasing).

### Trap 4: too many examples

Past 5 examples the payoff is tiny, and you burn extra tokens and lengthen the response.

**Fix**: start with 2-3, add more only if needed. You rarely need more than 5.

## When to use few-shot

Few-shot fits these situations best:

- **Format conversion**: unstructured text → JSON, Markdown, CSV
- **Classification**: sentiment analysis, topic tagging, intent detection
- **Style imitation**: matching a specific writing or code style
- **Rules that are hard to put into words**: like "what makes a comment useless"

When it doesn't fit:

- **The task is simple on its own**: "translate this into English" needs no examples
- **Every input is unique**: creative writing, brainstorming — examples just box you in
- **It needs outside knowledge**: "who won the 2024 World Cup" — examples can't help

A rule of thumb: if you could show a human colleague 2-3 examples and they'd understand what to do, few-shot is a good fit.

## Recap

Few-shot learning uses 2-5 examples to make the AI grasp the pattern you want, which is clearer than describing it in words. High-quality examples are: moderate in number (2-5), representative and diverse, identical in format, and inclusive of edge cases.

Few-shot fits format conversion, classification, and style imitation best. When designing examples, start with 2, make sure they cover different kinds of input, and use the same format across all of them.

Next lesson covers chain-of-thought — how to make the AI show its reasoning steps and improve accuracy on complex tasks.

**Next lesson** [Chain-of-Thought: Making AI Show Its Reasoning >>](./04-chain-of-thought.md)

<!-- exercises -->

## 💻 Exercises

### Level 1: Design high-quality examples

Task: get the AI to classify user feedback into three categories — "feature request", "bug report", or "usage question".

Design 3 few-shot examples that cover different cases and keep a consistent format.

<!-- rubric -->
- The three examples each represent one of the three categories
- The examples include an easily-confused edge case (e.g. "feature doesn't work" could be a bug or a user not knowing how to use it)
- All examples share exactly the same format (same structure, same markers)
- The examples read like real user feedback (not idealized one-liners)
- Each example's classification reason is clear enough to help the AI learn the standard
<!-- answer -->
**Example design:**

```
Classify user feedback as: feature request / bug report / usage question

Example 1:
Feedback: I wish it could batch-export data to Excel. Right now I have to
copy rows one at a time, which is a pain.
Classification: feature request

Example 2:
Feedback: After I click "Save" the page freezes and nothing happens. Waited
5 minutes, no response, and after a refresh the data wasn't saved.
Classification: bug report

Example 3:
Feedback: I can't find where to change my account email. I tried personal
settings and account management and didn't see the option.
Classification: usage question

Now classify this feedback:
Feedback: [paste the user feedback]
Classification:
```

**Why these examples work:**
1. **Diversity**: three distinct examples cover the three categories
2. **Clear boundaries**:
   - Example 1 says "I wish it could", so it's a feature request
   - Example 2 describes a concrete failure (freeze, no save), so it's a bug
   - Example 3 says "I can't find", so it's a usage question, not a missing feature
3. **Consistent format**: all use the "Feedback: [text] / Classification: [category]" format
4. **Real phrasing**: not a simple "I want a new feature" but the way a user actually writes

<!-- hint -->
When you design examples, first ask: which case is easiest to misclassify? For instance, is "I can't find a feature" a usage question or a missing feature? Use one example to pin down that boundary.
<!-- hint -->
Check that your three examples share exactly the same format: same field order, same punctuation, same line breaks. The AI copies the format of the examples closely.

### Level 2: Improve an existing few-shot prompt

Here's a few-shot prompt that doesn't work well. Find the problems and improve it:

```
Extract the pros and cons from a product review, output JSON.

Examples:
"decent quality" -> {"pros": ["quality"], "cons": []}
"too expensive, and slow shipping" -> {"pros": [], "cons": ["expensive", "slow delivery"]}

Now handle: [review text]
```

Problem: the AI's output is unstable — sometimes the field names come out in another language, sometimes the pros are adjectives ("good") instead of concrete points ("quality").

<!-- rubric -->
- Identifies at least 3 problems causing the unstable output
- The improved examples are perfectly consistent and clear in format
- The examples cover the complex case (both pros and cons, multiple points)
- Field naming and content style are spelled out
- Adds the necessary explanation or constraints
<!-- answer -->
**Problems identified:**
1. **Examples too simple**: the first example is one short phrase and never shows how to pull multiple points from a complex review
2. **No unified standard**: "quality" and "expensive" sit at different levels of abstraction (one a noun, one an adjective)
3. **Not enough examples**: only 2, too few to establish a stable pattern
4. **No edge cases**: never shows the complex "both pros and cons" situation

**Improved prompt:**

```
Extract the pros and cons from a product review and output JSON.

Field notes:
- pros: list of strengths, as short noun phrases (like "fast shipping",
  "good packaging"), not adjectives (not "good" or "nice")
- cons: list of weaknesses, same format

Example 1:
Input: Great quality, fine craftsmanship, no issues after a week of use.
Output:
{
  "pros": ["good quality", "fine craftsmanship", "reliable"],
  "cons": []
}

Example 2:
Input: A bit pricey, and shipping took a week to arrive, but the product
itself is pretty good.
Output:
{
  "pros": ["good product quality"],
  "cons": ["expensive", "slow shipping"]
}

Example 3:
Input: Too few features, only basic operations, all the advanced ones are
paywalled.
Output:
{
  "pros": [],
  "cons": ["few features", "advanced features paywalled"]
}

Now handle:
Input: [review text]
Output:
```

**What improved:**
1. Added field notes making it explicit to use "noun phrases", not adjectives
2. Three examples cover three cases: pros only, both pros and cons, cons only
3. The examples are more complex, showing how to pull multiple points from a long sentence
4. Perfectly consistent format: every example has an "Input:" and "Output:" marker, uniform JSON indentation
5. An "Input:" prompt precedes the output, marking where the task begins

<!-- hint -->
When a few-shot prompt is unstable, check first: (1) Is the example format consistent? (2) Are the examples too simple? (3) Do they cover edge cases?
<!-- hint -->
If the AI's field names or content style keep shifting, add a "field notes" or "output spec" block at the top of the prompt to pin down the format you want. Examples show the form; the spec states the standard.

<!-- /exercises -->
