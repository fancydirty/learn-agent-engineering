# Lesson 4: Chain-of-Thought: Making AI Show Its Reasoning

> Learning goals:
> - Understand how chain-of-thought works and why it helps
> - Learn to guide AI reasoning with "let's think step by step"
> - Recognize which task types are a good fit for CoT
>
> Prerequisites: [<< Lesson 3: Few-Shot Learning](./03-few-shot-learning.md) | Next: [Lesson 5 >>](./05-debugging-prompts.md)

## When AI Gives the Right Answer but the Wrong Reasoning

You ask AI a math word problem and it answers "42." You check it, and the answer is right. But swap in a similar problem and the answer comes out wrong. What happened? The model may have guessed, or followed a broken reasoning path that happened to land on the right number.

For tasks that need multi-step reasoning (math problems, logic puzzles, complex analysis), having AI show its reasoning steps is more reliable than asking for the answer directly[^S5][^S10]. That's the core idea behind chain-of-thought (CoT) prompting: break the conclusion into intermediate steps you can actually check.

## What Is Chain-of-Thought

**Chain-of-thought (CoT) prompting** is a technique that has the model lay out intermediate reasoning steps before it gives a final answer[^S5]. In the words of the research, chain-of-thought prompting "enables complex reasoning capabilities through intermediate reasoning steps"[^S5]. The intuition is simple: "Chain of Thought prompting encourages the model to think through the problem in a step-by-step manner, which is supposed to mimic how humans break down complex problems"[^S10]. It's the same thing you do when you list equations and intermediate results on scratch paper to solve a math problem.

Compare the two approaches:

### Answering Directly (Error-Prone)

❌ **Without CoT**:
```
Problem: A coffee shop sold 23 cups of coffee in the morning, 17 at noon, and twice the morning's amount in the afternoon. How many cups did it sell for the whole day?

Answer:
```

AI might just output:
```
86 cups
```

If the answer is wrong, you have no idea which step went off.

### Showing the Reasoning Steps (More Reliable)

✅ **With CoT**:
```
Problem: A coffee shop sold 23 cups of coffee in the morning, 17 at noon, and twice the morning's amount in the afternoon. How many cups did it sell for the whole day?

Let's think step by step:
```

AI outputs:
```
Let's think step by step:

1. Morning sales: 23 cups
2. Noon sales: 17 cups
3. Afternoon is twice the morning: 23 × 2 = 46 cups
4. Day total: 23 + 17 + 46 = 86 cups

Answer: 86 cups
```

Every step is visible, so if one is wrong you can spot it right away and fix the prompt.

Research shows that on tasks involving multi-step reasoning, CoT lifts accuracy substantially[^S5]; on some tasks, pairing CoT with worked demonstrations raises accuracy by up to another 28.2%[^S10].

## Two Ways to Use CoT

### Method 1: Zero-Shot CoT (Simplest)

Add one line to the end of your prompt: "**let's think step by step**"[^S5][^S10].

```
Problem: If 5 workers need 5 days to finish a project, how many days do 10 workers need?

Let's think step by step:
```

That single line triggers the model's step-by-step reasoning mode. You don't provide any examples; the model breaks the problem down on its own.

### Method 2: Few-Shot CoT (More Controllable)

Give one or two examples that include the full reasoning process[^S5][^S10].

```
Example:
Problem: A car travels at 60 km/h. How far does it go in 3 hours?
Reasoning:
- Speed = 60 km/h
- Time = 3 hours
- Distance = speed × time = 60 × 3 = 180 km
Answer: 180 km

Now solve this problem:
Problem: A car travels at 80 km/h for 2.5 hours, then at 60 km/h for another 1 hour. How far does it travel in total?
Reasoning:
```

The example shows the reasoning format and how detailed the steps should be, and the model imitates that style.

## What Tasks Suit CoT

CoT is best for tasks that need multi-step reasoning[^S10]:

✅ **Math and logic reasoning**
- Word problems
- Ratio and proportion calculations
- Multi-step formula derivations

✅ **Causal analysis**
- "Why does X cause Y?"
- "What's the root cause of this bug?"

✅ **Planning and decisions**
- "Should I do A first or B first?"
- "What are the pros and cons of this approach?"

✅ **Code debugging**
- "Why does this code fail?"
- "Which step is the performance bottleneck?"

Where it doesn't fit:

❌ **Simple fact lookups**: "When was Python first released?" — no reasoning needed
❌ **Creative writing**: poems, stories — reasoning steps break the creative flow
❌ **Format conversion**: JSON → CSV — a mechanical operation, no reasoning needed

Rule of thumb: if you'd reach for scratch paper to list out steps when doing the task yourself, it's a good fit for CoT.

```agentmentor-check
{
  "id": "prompt-engineering-cot-task-fit",
  "label": "Judge whether a task suits CoT",
  "prompt": "Which of these tasks is the best fit for chain-of-thought prompting?\n\nA: Translate this English text into Chinese\nB: Analyze the time complexity of this code and explain why\nC: Generate 10 creative product names\nD: Rewrite this text in a formal tone",
  "whyHere": "Checks whether you can tell that CoT fits multi-step reasoning tasks, not simple conversions or creative generation — the exact trap that makes people bolt CoT onto everything",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "A - Translation task",
      "correct": false,
      "feedback": "❌ Translation is a language conversion, not a reasoning task. The model does process the text internally, but spelling out steps like 'first translate the subject, then the verb' does little for translation quality."
    },
    {
      "id": "b",
      "text": "B - Analyze time complexity",
      "correct": true,
      "feedback": "✓ Correct. Time-complexity analysis needs several reasoning steps: spot the loop structure, count each loop's iterations, check for nesting, land on O(n) or O(n²). Showing those steps keeps the logic honest and lets you check where a judgment went wrong."
    },
    {
      "id": "c",
      "text": "C - Generate creative names",
      "correct": false,
      "feedback": "❌ Creative generation doesn't need visible reasoning steps. Forcing CoT ('step one: pick a root word, step two: add a prefix...') narrows the ideas and makes the output mechanical."
    },
    {
      "id": "d",
      "text": "D - Rewrite in a formal tone",
      "correct": false,
      "feedback": "❌ Rewriting tone is a style conversion, not reasoning. You could list steps ('drop the slang, swap in written phrasing'), but they help the result little; rewriting directly works better."
    }
  ]
}
```

## Worked Examples: Analyzing Problems with CoT

### Scenario 1: Code Performance Analysis

**Without CoT (conclusion you can't trust)**:
````
Does this code have a performance problem?

```python
def find_duplicates(items):
    duplicates = []
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            if items[i] == items[j] and items[i] not in duplicates:
                duplicates.append(items[i])
    return duplicates
```

Answer: Yes, it has a performance problem
````

Just a conclusion, with no reason why.

**With CoT (clear reasoning)**:
````
Analyze this code's performance problem. Explain step by step:
1. Identify the loop structure
2. Compute the time complexity
3. Point out the specific bottleneck
4. Suggest an optimization

```python
def find_duplicates(items):
    duplicates = []
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            if items[i] == items[j] and items[i] not in duplicates:
                duplicates.append(items[i])
    return duplicates
```
````

AI shows:
```
Performance analysis:

1. Loop structure:
   - Outer loop: iterates over each element, O(n)
   - Inner loop: for each element, iterates over the remaining ones, O(n)
   - Overall: nested loops, O(n²)

2. Time complexity:
   - Main loops: O(n²)
   - The `items[i] not in duplicates` check: O(m) worst case, where m is the number of duplicates found so far
   - Total complexity: O(n² × m)

3. Performance bottleneck:
   - The nested loops get very slow on large inputs (n > 1000)
   - The `not in` linear scan over a list slows it down further

4. Optimization:
   - Use a set instead of a list to store duplicates, dropping the check from O(m) to O(1)
   - Or use a Counter to find all elements appearing more than once in a single pass, dropping it to O(n)
```

Every reasoning step is checkable, so if one is wrong you can see it immediately.

### Scenario 2: A Logic Puzzle

**Problem**:
```
Three people — A, B, and C — enter a competition. We know:
- A is not first place
- B is not last place
- C is neither first nor last place

What are their rankings?

Let's reason step by step:
```

**AI output**:
```
Let's reason step by step:

1. Start from C's condition:
   - C is not first and not last
   - So C must be second

2. Pin down A and B:
   - A is not first
   - B is not last
   - C is already second, leaving first and third for A and B

3. Assign the remaining ranks:
   - A is not first, so A is third
   - B is not last (third), so B is first

Answer: B first, C second, A third
```

Laying out this step-by-step elimination makes it much easier to check whether the logic is airtight.

## Common CoT Patterns

### Pattern 1: Problem Decomposition

Break a complex problem into a few sub-problems.

```
Problem: A software project has 5 engineers, each working 6 hours a day, and needs 120 person-days of work. If it scales up to 8 engineers, how many days sooner can it finish?

Let's compute step by step:
1. How many days does the current setup need?
2. How many days after adding people?
3. How many days sooner?
```

### Pattern 2: Hypothesis Testing

List the hypotheses, then check them one by one.

```
This code throws "TypeError: unsupported operand type(s)". What are the possible causes?

Let's check the possible causes one by one:
1. Check the types of the variables on each side of the operator
2. Check whether a None value is involved in the operation
3. Check whether a string and a number are being mixed
```

### Pattern 3: Arguing Both Sides

List the reasons for and against, then reach a conclusion.

```
Should we use a microservices architecture or a monolith?

Let's analyze it from two angles:

Reasons for microservices:
1. ...
2. ...

Reasons for a monolith:
1. ...
2. ...

Overall judgment:
Based on the current team size and project complexity, I recommend...
```

## The Limits of CoT

CoT isn't a cure-all. It has a few limits:

**1. It adds length and time**

Showing reasoning steps makes the output longer, burns more tokens, and takes longer to respond.

**When it's worth it**: on complex tasks, spending 2-3x the tokens to gain accuracy is a good trade.
**When it isn't**: on simple tasks ("what day is it today"), the reasoning steps are pure waste.

**2. The reasoning steps can themselves be wrong**

The steps AI shows can look reasonable but still have a hole in the logic. You still need to check whether the reasoning is correct.

The value of CoT is that it makes errors visible. When AI answers directly, the error hides in a black box; when the steps are shown, the error surfaces at some step and is easier to find and fix.

**3. It doesn't suit tasks that rely on intuition**

Some tasks (creative writing, evaluating art) lean on an overall feel, and forcing them into steps breaks the whole.

## Recap

Chain-of-thought prompting has AI show its reasoning steps instead of jumping straight to an answer. By adding "let's think step by step" to a prompt, or by providing examples that include the reasoning, you can substantially raise accuracy on multi-step reasoning tasks.

CoT fits math reasoning, logic analysis, causal inference, complex decisions — anything that needs multiple steps of thought. It makes the reasoning visible and checkable. It does add output length, but on complex tasks the payoff far outweighs the cost.

The next lesson covers how to debug and improve prompts: when AI's output doesn't match what you expected, how to systematically find the problem and fix it.

**Next lesson** [Debugging and Improving Prompts >>](./05-debugging-prompts.md)

<!-- exercises -->

## 💻 Exercises

### Level 1: Apply zero-shot CoT

Use the "let's think step by step" technique to have AI solve the problem below:

**Problem**: A team has 8 people, each working 6 hours a day. The project needs 240 person-hours of work. If the team grows to 12 people, how many days sooner can it finish?

Write the full prompt (including "let's think step by step"), then predict which intermediate steps AI will show.

<!-- rubric -->
- The prompt includes "let's think step by step" or a similar cue
- The problem statement is clear and complete
- The predicted reasoning steps are logically correct
- The reasoning steps cover the key calculations (days needed under the current setup, days needed under the new setup, the difference)
- Identifies why this problem is a good fit for CoT
<!-- answer -->
**Prompt**:
```
A team has 8 people, each working 6 hours a day. The project needs 240 person-hours of work. If the team grows to 12 people, how many days sooner can it finish?

Let's think step by step:
```

**Predicted reasoning steps**:
```
Let's think step by step:

1. Compute the current team's daily output:
   - 8 people × 6 hours/person/day = 48 person-hours/day

2. Compute the days needed under the current setup:
   - 240 person-hours ÷ 48 person-hours/day = 5 days

3. Compute the expanded team's daily output:
   - 12 people × 6 hours/person/day = 72 person-hours/day

4. Compute the days needed under the new setup:
   - 240 person-hours ÷ 72 person-hours/day = 3.33 days (about 3.4 days)

5. Compute the days saved:
   - 5 days − 3.33 days = 1.67 days (about 1.7 days, or 1 day and 17 hours)

Answer: the project can finish about 1.7 days sooner.
```

**Why it fits CoT**:
- It's a multi-step calculation where each step feeds the next
- Answering directly makes it easy to miscalculate or skip a step
- Showing the steps lets us check each calculation
- If the answer is off, we can quickly locate which step went wrong

<!-- hint -->
The key with this kind of problem: compute the current state first, then the state after the change, then the difference. When predicting the reasoning steps, list each calculation in that order.
<!-- hint -->
Zero-shot CoT is just adding one line, "let's think step by step" — no examples needed. Try using this technique to have AI explain its reasoning.

### Level 2: Design a few-shot CoT prompt

Scenario: you need AI to judge a piece of code's time complexity and explain the reasoning.

Design a few-shot CoT prompt with 2 examples (one O(n), one O(n²)) that shows the full reasoning steps.

<!-- rubric -->
- Both example code snippets have a clear structure and correct complexity judgments
- Each example's reasoning steps are complete: identify loops → compute each level's complexity → combine into the total complexity
- The reasoning steps use a consistent format
- The examples cover different types (single loop vs. nested loop)
- The prompt states the task and the output format
<!-- answer -->
**Few-shot CoT Prompt**:

````
Analyze the code's time complexity and show the reasoning steps.

Example 1:
Code:
```python
def find_max(arr):
    max_val = arr[0]
    for num in arr:
        if num > max_val:
            max_val = num
    return max_val
```

Reasoning:
1. Identify the loop structure: one for loop over the array
2. Iteration count: visits n elements, each accessed once
3. Loop body operations: comparison and assignment, both O(1) constant time
4. Total complexity: O(n) × O(1) = O(n)

Conclusion: the time complexity is O(n)

---

Example 2:
Code:
```python
def find_duplicates(arr):
    duplicates = []
    for i in range(len(arr)):
        for j in range(i + 1, len(arr)):
            if arr[i] == arr[j]:
                duplicates.append(arr[i])
    return duplicates
```

Reasoning:
1. Identify the loop structure: two nested for loops
2. Outer loop: iterates over n elements
3. Inner loop: for each i, iterates over (n-i-1) elements
4. Total iteration count: (n-1) + (n-2) + ... + 1 = n(n-1)/2 ≈ n²/2
5. Loop body operations: comparison and append, both O(1)
6. Total complexity: O(n²) × O(1) = O(n²)

Conclusion: the time complexity is O(n²)

---

Now analyze this code:
Code:
```python
[paste code]
```

Reasoning:
````

**Why this prompt works**:
1. **Clear contrast between examples**: the difference between O(n) and O(n²) is whether the loops are nested
2. **Standardized reasoning steps**: identify structure → count iterations → analyze operations → reach a conclusion
3. **Consistent format**: both examples use the same numbered-step format
4. **Each step explained enough**: not just "this is O(n)" but why it's O(n)
5. **Ends open**: "Reasoning:" cues AI to output the reasoning process

<!-- hint -->
The key with few-shot CoT: the examples shouldn't just give the answer, they should show every step of thought from problem to answer. Imagine teaching a person to do this task — how would you break it down for them?
<!-- hint -->
When you design the reasoning steps, make sure each one is necessary (skipping it leaves the understanding incomplete) and verifiable (you can check that step on its own).

<!-- /exercises -->
