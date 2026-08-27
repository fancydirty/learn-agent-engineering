# Lesson 1: What a Prompt Is, and Why It Matters

> Learning goals:
> - Understand what a prompt is and what it does
> - Tell a vague prompt apart from a clear one
> - See how prompt quality shapes what the AI gives back
>
> Prerequisites: You've used an AI chat tool before | Next: [Lesson 2 >>](./02-prompt-structure.md)

## You're Already Using Prompts (Maybe Not Well)

You open ChatGPT or Claude, type "write me a report," and get back something generic that doesn't line up with what you actually needed. That's not the AI failing you. Your prompt was too vague. All the AI saw was four words. It has no idea who the report is for, what problem it should solve, what tone to strike, or what to put in it.

A prompt is the instruction you give the AI[^S13]. It sets how much of your intent the AI can pick up, and it caps the quality of what comes back. Same question, two outcomes: a vague instruction gets a vague answer, a clear one gets a precise result. This lesson teaches you to spot that difference, which sets up everything that follows.

## What a Prompt Is

A **prompt** is the text you give a large language model (LLM) to tell it what you want[^S13]. It can be a question, a description, a task, or some mix of the three.

A large language model is an AI system trained on huge amounts of text — "a type of language model notable for its ability to achieve general-purpose language understanding and generation."[^S14] ChatGPT, Claude, and similar tools all belong to this category. They aren't search engines. They don't look up a ready-made answer online; they generate new text that fits your instruction, working from patterns learned during training.

Here's the key point: **an LLM can only understand the task through your prompt.** Anything you leave out, it has to guess. The clearer you are, the closer the output lands to what you had in mind.

## Vague Prompt vs. Clear Prompt

Two real examples show the gap.

**Scenario 1: Asking the AI to explain a technical concept**

❌ **Vague prompt:**
```
what is an API
```

The AI might hand you:
- a textbook definition ("API stands for application programming interface...")
- something too technical (it assumes you can code)
- or something too shallow (just "it lets programs talk to each other")

✅ **Clear prompt:**
```
I'm a product manager and I don't code. Explain what an API is using
an everyday analogy, so I can follow what my dev team means when they
bring it up in planning.
```

The AI gives you:
- an explanation pitched at a product manager
- an everyday analogy (something like "a restaurant menu is a kind of API")
- examples tied to your actual work

What changed? The clear prompt spells out three things: **who you are (a product manager), your background (you don't code), and what you'll do with the answer (talk requirements with the dev team).**

**Scenario 2: Asking the AI to write code**

❌ **Vague prompt:**
```
write a Python function to process data
```

The AI is left guessing:
- what data? a list, a dict, a file, a database?
- process it how? sort, filter, transform, aggregate?
- what are the input and output formats?

✅ **Clear prompt:**
```
Write a Python function that takes a list of user ratings (1-5),
filters out any rating below 3, and returns the average of what's
left, rounded to one decimal place. Include type hints and a docstring.
```

The AI can produce:
- a clear function signature
- filtering and calculation logic that matches the spec
- proper docs and type annotations

What changed? The clear prompt names the **input format, the processing logic, the output requirement, and the code style.**

```agentmentor-check
{
  "id": "prompt-engineering-what-is-prompt-identify-clear",
  "label": "Is this prompt clear?",
  "prompt": "Which prompt is clearer — which gives the AI a better shot at understanding what you want?\n\nA: \"Summarize this article\"\n\nB: \"Summarize this article's main points as three bullet points, one sentence each, written for a non-expert reader\"",
  "whyHere": "You just saw that a clear prompt names format, audience, and scope. The trap here is assuming a shorter prompt is automatically a clearer one — check that you can tell the two apart.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "A is clearer, because it's short and direct",
      "correct": false,
      "feedback": "❌ Short isn't the same as clear. A never says how many points, how long each should be, or who's reading it, so the AI has to guess. You might get one long paragraph, five bullets, or something full of jargon."
    },
    {
      "id": "b",
      "text": "B is clearer, because it sets the format, length, and audience",
      "correct": true,
      "feedback": "✓ Correct. B pins down three things: output format (three bullets, one sentence each), audience (a non-expert reader), and scope (the main points). The AI knows what to produce."
    }
  ]
}
```

## Prompt Quality Decides Output Quality

On complex tasks, how clearly you write the prompt makes a measurable difference in output quality — and since the same prompt gets reused over and over, that gap compounds with every run[^S7]. Run it the other way and a vague prompt costs you:

- **More rounds of revision.** You get an answer that misses, you add a detail, you get one that's still off, you add another. It takes several passes to close in on what you wanted.
- **Inconsistent output.** Ask the same fuzzy question twice and the style, depth, and emphasis come back different each time.
- **Wasted tokens and time.** A vague prompt makes the AI generate a pile of material you can't use, burning your token budget (if you're on a paid API) or your patience.

**Key finding:** Microsoft's Developer Tools research group found that in code-generation tasks, "prompts with explicit specifications reduced the need for back-and-forth refinements by 68%."[^S12] That means you're far more likely to get usable code on the first try, instead of circling the target through a third and fourth round.

The payoff from a clear prompt shows up right away: less trial and error, a higher first-try success rate, and output you can actually steer.

## Prompt Engineering Is a Skill

Prompt engineering is the systematic practice of designing and refining prompts[^S13]. It isn't about finding one magic incantation. It's about understanding how the AI works and learning to state what you need in terms it can act on.

As of 2026, models follow instructions well — they handle complex directions, long documents, and multi-step tasks[^S6]. But they still lean on your prompt to set the boundaries of the task. A model can't read your mind. What you don't say, it doesn't know.

Prompt engineering covers:
- writing the basic structure of a clear instruction (Lesson 2)
- using examples to show the AI the pattern you want (Lesson 3)
- getting the AI to show its reasoning (Lesson 4)
- debugging and improving prompts systematically (Lesson 5)
- picking a strategy to match the task (Lesson 6)

This course teaches reusable methods, not one-off tricks. Once you have them, you can work more efficiently with any LLM tool.

## Recap

A prompt is the instruction you give the AI, and it decides how much of your intent the AI can pick up. A vague prompt leaves the AI guessing; a clear one pins down the task boundaries, the output format, and the background it needs. Research shows a clear prompt cuts down revision rounds and gets the job done more efficiently.

The next lesson covers the basic structure of a prompt — how to break a fuzzy request into four clear parts: role, task, format, and constraints.

**Next** [The Basic Structure of a Prompt >>](./02-prompt-structure.md)

<!-- exercises -->

## 💻 Exercises

### Level 1: Spot and rewrite a vague prompt

A colleague wrote this prompt: "help me optimize this code." Name the three main problems with it, then rewrite it as a clear version.

<!-- rubric -->
- Identifies at least 2 of the key problems (no optimization goal, no code language or context, no output format specified)
- The rewrite names an optimization goal (performance / readability / security, etc.)
- The rewrite includes the context the AI needs
- The rewrite specifies the expected output format
<!-- answer -->
**Problem analysis:**
1. No optimization goal: performance, readability, or security?
2. No code context: what language? what does it do? any known issues?
3. No output format: do you want the rewritten code, or a list of suggestions?

**Rewrite example:**
```
You're a senior Python performance engineer.

Analyze the performance bottlenecks in the Python data-processing code
below and give me optimization recommendations.

Context: this code processes a list of 100,000 user records and
currently takes 30 seconds to run.

Output format:
1. Current bottlenecks (ordered by impact, noting the data volume at
   which each becomes a problem)
2. Recommendations (each with: the specific change, the expected
   performance gain, and the optimized code snippet)

Code:
[paste code]
```

<!-- hint -->
Start from the four elements you'll learn in Lesson 2: which ones is this prompt missing? What's wrong with the role, the task, the format, and the constraints?
<!-- hint -->
Think about it: if you were the AI and all you saw was "optimize this code," could you tell what to do? What extra information would you need to give a useful answer?

### Level 2: Design a prompt for a real situation

Pick a situation where you recently used an AI tool (or use this one): **have the AI write an email to a customer, explaining why a product delivery is late and apologizing for it.**

Design a clear prompt that makes sure the AI produces an email that fits your needs.

<!-- rubric -->
- The prompt names the email's audience (the customer's role and background)
- The prompt states the specific reason for the delay and the new delivery date
- The prompt specifies the email's tone and style (formal, sincere, professional, etc.)
- The prompt includes the necessary constraints (length, structure, what to avoid, etc.)
- The prompt is well structured, so the AI can take in all the requirements at once
<!-- answer -->
**Example prompt:**

```
You're a professional account manager, skilled at keeping a customer's
trust in a difficult situation.

Write an email to a business customer explaining that a software
project's delivery is delayed.

Context:
- Customer: the IT director at a bank
- Project: a risk-management system we're building for them
- Original delivery date: 2024-03-15
- New delivery date: 2024-04-01 (a 2-week slip)
- Reason for the delay: a security audit found we need to strengthen
  the data-encryption module, a necessary change to keep the system safe

Email requirements:
- Tone: formal, professional, sincere
- Structure: apology -> reason -> why this delay is in the customer's
  interest -> new timeline -> what we're doing to make up for it
- Length: no more than 300 words
- Avoid: over-apologizing (don't say "so sorry" over and over),
  dodging responsibility, empty reassurances

Output:
Give me only the body of the email, with no lead-in like "Here's the email."
```

**Why this prompt works:**
- It names the role (account manager) and the writing situation
- It supplies all the context needed (who, what, when, why)
- It specifies concrete requirements for tone, structure, and length
- It says what to avoid, heading off common AI mistakes
- It sets a clear output format you can use directly

<!-- hint -->
First list the facts this email has to contain: who, what happened, why, the new timeline, and how you'll make it right. Then think about how to get the AI to hold all that while also landing the right tone and style.
<!-- hint -->
If your first prompt isn't clear enough, try it once and see where the AI's output misses, then add constraints to target those gaps. Remember: debugging a prompt is a normal, iterative process.

<!-- /exercises -->
