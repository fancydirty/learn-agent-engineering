# Lesson 5: Case Study: Building a Code Review Skill

> Learning goals:
> - Learn how to organize a multi-step workflow
> - Understand how the checklist pattern applies
> - Get comfortable using supporting files
> - Build one complex Skill that's ready for real use
>
> Prerequisites: [<< Lesson 4](./04-testing-debugging.md) | Next: [Lesson 6 >>](./06-advanced-patterns.md)

## Why Code Review Makes a Good Case Study

Code review is a textbook structured workflow:[^S3]

- **The steps are fixed**: check conventions, look for problems, propose changes
- **The standards are measurable**: every check item either passes or it doesn't
- **It repeats constantly**: every PR needs one
- **It suits a Skill**: write your team's review standards into a Skill and every review holds the same bar

This case study shows you:
- How to break a complex workflow into clear steps
- How to organize instructions around a checklist
- How to handle several output dimensions at once

## Step 1: Define the Review Scope

Before writing anything, decide what this Skill is responsible for checking.

**Our code review Skill covers three dimensions:**

1. **Conventions**: naming, formatting, comments
2. **Potential problems**: error handling, edge cases, security risk
3. **Maintainability**: duplicated code, function length, logical complexity

**What it deliberately doesn't check:**
- Whether the business logic is actually correct (that needs real knowledge of the requirements)
- Algorithmic efficiency (that needs performance testing)
- UI/UX design (out of scope for code review)

## Step 2: Create the Directory Structure

This time we'll use supporting files to organize the review rules:[^S2]

```bash
mkdir -p ~/.claude/skills/code-review
mkdir -p ~/.claude/skills/code-review/checklists

touch ~/.claude/skills/code-review/SKILL.md
touch ~/.claude/skills/code-review/checklists/naming.md
touch ~/.claude/skills/code-review/checklists/error-handling.md
```

**Why split the files:**
- SKILL.md stays short and holds only the core flow
- The detailed check rules live in separate files, loaded on demand[^S2]
- Your team can maintain each checklist independently without touching the main file

## Step 3: Write the Main SKILL.md

```markdown
---
name: code-review
description: Reviews code changes for naming conventions, error handling, potential bugs, and maintainability problems. Use for PR review or general code quality checks
---

# Code Review Assistant

Review code changes systematically against team conventions and established practice.

## Input Formats

Accept any of the following:

- Git diff output
- A complete source file
- A code fragment (a function or a class)
- A PR link (read the PR contents with a tool first)

## Review Flow

Run the review in this order:

### 1. Convention Check

Consult `checklists/naming.md` and work through each item:

- **Variable names**: meaningful, and consistent with the team's convention (camelCase, snake_case, and so on)
- **Function names**: start with a verb, state the intent clearly
- **Class names**: nouns, aligned with single responsibility
- **Constant names**: all caps, underscore-separated

**Standard:** every name should tell someone unfamiliar with the code what it's for

### 2. Error Handling Check

Consult `checklists/error-handling.md` and check:

- **Exception capture**: is there a try/catch, and does it catch the right exception types
- **Error return values**: does the function handle and propagate errors correctly
- **Edge cases**: are empty input, null, undefined, and empty arrays handled
- **Resource cleanup**: are files, connections, and locks released properly

**Standard:** anything that can fail needs error handling

### 3. Potential Problem Check

- **Null/undefined access**: could this reach a property or method that doesn't exist
- **Type safety**: any risk of implicit type coercion
- **Concurrency**: any race conditions or deadlock risk
- **Security holes**: SQL injection, XSS, CSRF, leaked secrets

**Standard:** flag any code that could produce a runtime error or a security risk

### 4. Maintainability Check

- **Function length**: suggest splitting anything over 50 lines
- **Duplication**: suggest extracting logic that appears three or more times
- **Nesting depth**: suggest refactoring past three levels
- **Comment quality**: is complex logic explained

**Standard:** another developer should be able to read and change this code easily

## Output Format

Report the review in this structure:

### ✅ Passed
- [check item] - meets the standard

### ⚠️ Worth a Look
- **Location**: `file:line`
- **Problem**: what exactly is wrong
- **Impact**: what this could lead to
- **Suggestion**: how to improve it

### 🔴 Must Fix
- **Location**: `file:line`
- **Problem**: what exactly is wrong
- **Risk**: why this can't ship as-is
- **Suggestion**: the concrete fix

### 📊 Overall Assessment
- Code quality: strong / acceptable / needs work
- Main problems: [the 2-3 most important issues]
- Suggested priority: [what to fix first]

## Notes

- **Missing context**: if the fragment is incomplete, say that you may need more of the surrounding code
- **Framework idioms**: something that looks like a problem may be a framework-specific pattern — mark it "needs confirmation"
- **Test code**: relax the standards for tests where it makes sense (function length, for instance)
- **Nothing found**: if every check passes, output "✅ Review passed, no obvious problems found"
```

## Step 4: Write the Supporting Files

**checklists/naming.md:**

```markdown
# Naming Convention Checklist

## Variable Names

**Good:**
- `userCount`: clearly a count of users
- `isAuthenticated`: booleans start with is/has/can
- `maxRetryAttempts`: states both the meaning and the unit

**Bad:**
- `x`, `temp`, `data`: too generic
- `flag`, `status`: don't say what state they hold
- `getUserInfo2`: a numeric suffix usually means there's a duplicate

## Function Names

**Good:**
- `calculateTotalPrice()`: verb plus noun, states both the action and its object
- `validateUserInput()`: says what it does and what it acts on
- `fetchUserProfile()`: `fetch` signals this is async

**Bad:**
- `process()`: too generic, processes what
- `doStuff()`: expresses no intent at all
- `handleData()`: both `handle` and `data` are too broad

## Class Names

**Good:**
- `UserRepository`: a noun that states the responsibility (reading and writing user data)
- `PaymentProcessor`: clearly the thing that handles payments
- `EmailValidator`: states the email-validation responsibility

**Bad:**
- `Manager`, `Helper`, `Utility`: suffixes too generic to mean anything
- `DataClass`: doesn't say which data
```

**checklists/error-handling.md:**

````markdown
# Error Handling Checklist

## Scenarios You Must Check

### 1. External Dependency Calls
- API requests (network failure, timeout, 4xx/5xx responses)
- Database queries (connection failure, query timeout, constraint violation)
- File operations (missing file, insufficient permissions, disk full)

### 2. User Input
- Empty input, null, undefined
- Malformed input
- Out-of-range values

### 3. Data Conversion
- JSON parsing (malformed input)
- Type conversion (string-to-number failure)
- Date parsing (invalid date format)

## Error Handling Patterns

**Catch and handle:**
```javascript
try {
  const data = await fetchUser(id);
  return processData(data);
} catch (error) {
  logger.error('Failed to fetch user', { id, error });
  return null; // or throw a custom error
}
```

**Check before calling:**
```javascript
if (!user) {
  throw new Error('User not found');
}
const profile = user.getProfile(); // safe — user is definitely not null
```

## Common Mistakes

**Problem:** an empty catch block
```javascript
try {
  riskyOperation();
} catch (e) {
  // nothing happens here — the error gets swallowed
}
```

**Fix:** log it, at minimum
```javascript
try {
  riskyOperation();
} catch (e) {
  logger.error('Operation failed', e);
  throw e; // or return an error status
}
```
````

## Step 5: Test a Messy Case

Prepare a snippet with several problems in it:

```javascript
function process(data) {
  var result = [];
  for (var i = 0; i < data.length; i++) {
    var item = data[i];
    if (item.type == "A") {
      var x = item.value * 2;
      result.push(x);
    } else if (item.type == "B") {
      var y = item.value / 2;
      result.push(y);
    } else {
      result.push(item.value);
    }
  }
  return result;
}
```

Invoke the Skill:

```
/code-review

[paste the code above]
```

**The output should include:**

- ⚠️ Naming: `process`, `data`, `x`, and `y` are all too generic
- ⚠️ Uses `var` instead of `const`/`let`
- ⚠️ Uses `==` instead of `===`
- ⚠️ Never checks whether `data` is null or not an array
- ⚠️ Never checks whether `item.value` exists
- Suggestion: the function can be split into smaller pure functions

## Step 6: Iterate

**What the first run tends to surface:**

- Misses (real problems it didn't catch) → add check rules
- Output too long → tighten the output format so it reports only what matters
- False positives (normal code flagged as a problem) → add a "needs confirmation" category

**Keep improving it:**

1. After each review, note which problems slipped past
2. Update the checklists
3. Test again
4. A month in, the Skill gets genuinely accurate.[^S8]

```agentmentor-check
{
  "id": "skills-zh-05-checklist-structure",
  "label": "Decide how to organize the checklist",
  "prompt": "You're writing a code review Skill and the check rules keep growing — SKILL.md is now past 300 lines. What's the better move?",
  "whyHere": "You just watched this Skill's review rules get pushed out into checklists/ instead of into SKILL.md. The mistake at this point is treating SKILL.md as the place where everything accumulates, so it's worth pinning down when a file should be split before your own Skill grows past this size.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Keep writing in SKILL.md so all the rules and the flow stay in one file",
      "correct": false,
      "feedback": "300 lines is too long. Claude reads the whole SKILL.md when it loads the Skill, so length costs you context on every invocation — and you have to scroll through all of it every time you want to change one rule. Move the detailed rules into checklists/ and the main file gets clearer."
    },
    {
      "id": "b",
      "text": "Move the detailed check rules into supporting files, keeping the flow in the main file",
      "correct": true,
      "feedback": "Right. This is progressive disclosure in practice: SKILL.md holds only the core flow (\"consult checklists/naming.md to check naming\"), and the detailed rules sit in their own files. Claude reads those files when it needs them, and a main file under 100 lines is far easier to maintain."
    }
  ]
}
```

<!-- exercises -->
## 💻 Exercises

### Level 1: Build Your Own Review Skill

Pick a domain you know well — frontend code, API design, SQL queries, documentation — and build a review Skill for it.

**Requirements:**
1. At least 3 review dimensions
2. 3-5 concrete check items per dimension
3. A clear output format (passed, worth a look, must fix)
4. Test it on at least 2 real cases

<!-- rubric -->
- The dimensions are well-defined and worth checking
- Every check item is concrete enough to act on (not "check code quality")
- The output format makes severity obvious at a glance
- You tested real code or real documents and recorded the results

<!-- answer -->
Sample answer (API design review):

```markdown
---
name: api-design-review
description: Reviews API design for RESTful conventions, parameter naming, error handling, and documentation completeness. Use during API design review
---

# API Design Review

## Review Dimensions

### 1. RESTful Conventions
- URLs use nouns, not verbs (✓ `/users` ✗ `/getUsers`)
- HTTP methods are correct (GET reads, POST creates, PUT updates, DELETE removes)
- Status codes make sense (200/201/400/404/500)

### 2. Parameter Design
- Parameter names are clear, and one style is used throughout (snake_case or camelCase)
- Required and optional parameters are distinguished
- Validation rules are documented

### 3. Error Handling
- There's one consistent error response shape
- Error messages carry enough context to act on
- Error codes exist so clients can branch on them

## Output Format

### ✅ Meets the Convention
- [check item]

### ⚠️ Suggested Improvement
- **Problem**: [what's wrong]
- **Suggestion**: [how to improve it]

### 🔴 Convention Violation
- **Problem**: [what's wrong]
- **Impact**: [why this is serious]
- **Fix**: [what has to change]
```

<!-- hint -->
Pick something you review at least three times a week — otherwise the Skill won't get enough use to be worth the effort

<!-- hint -->
The first version doesn't need to cover everything. Write the 3 most common problems, use it for a week, then add more

### Level 2: Compare a Human Review Against the Skill's

Take one piece of code and review it twice:
1. By hand, yourself
2. With the code-review Skill

Compare what each found, and write down:
- Which problems the Skill caught that you missed
- Which problems you caught that the Skill missed
- Which of its findings were false positives (flagged as problems but actually fine)

<!-- rubric -->
- The same code went through both review methods
- You recorded a side-by-side comparison of the findings
- You analyzed where the Skill is strong and where it falls short
- You proposed concrete changes to the Skill

<!-- answer -->
Sample comparison:

**The code:** a 50-line data-processing function

**Human review found:**
- Unclear variable names (2 spots)
- Missing error handling (1 spot)
- Logic that could be simplified (1 spot)

**Skill review found:**
- Unclear variable names (3 spots — one more than I found)
- Missing error handling (2 spots — one more than I found)
- Function over 50 lines, suggests splitting
- Uses `==` instead of `===` (2 spots, both of which I missed)

**False positive:**
- The Skill flagged "duplicated code," but those two blocks only look similar — they serve different purposes and shouldn't be merged

**Changes to make:**
- Add a similarity threshold to the duplication check so it stops flagging every resemblance
- Add the "logic simplification" rule I applied by hand to the Skill

<!-- hint -->
Skills are good at the mechanical, measurable problems — naming, formatting, obviously absent error handling. Judging whether the business logic is any good still needs a person

<!-- /exercises -->

## Recap

- **Code review is a natural fit for a Skill**: fixed steps, measurable standards, high repetition
- **Organize the flow as a checklist**: conventions, error handling, potential problems, maintainability
- **Supporting files keep the Skill maintainable**: the main file stays short, detailed rules live on their own
- **Grading the output matters**: passed, worth a look, must fix — so the reviewer knows what to do first
- **Keep iterating**: add the checks you missed after each review, and a month in it'll be accurate

In the next lesson we move on to advanced patterns: personal versus project skills, version control, and team collaboration.

[Lesson 6 >>](./06-advanced-patterns.md)
