# Lesson 6: Advanced Patterns: Making Skills More Powerful

> Learning goals:
> - Understand the difference between personal skills and project skills
> - Manage project skills with Git
> - Apply the team practices that keep shared Skills healthy
> - Know what else exists in the Skills ecosystem
>
> Prerequisites: [<< Lesson 5](./05-code-review-skill.md)

## Personal Skills vs Project Skills

Every Skill we've built so far went into `~/.claude/skills/`. Those are personal skills — only you can use them. [^S1]

On a team, though, you usually want something else:

- Everyone reviewing code against the same standard
- A new hire cloning the repo and having the team's Skills immediately
- Improvements to a Skill reaching everyone without anyone copying files around

That's what **project skills** are for. [^S9]

### How the two differ

| Trait | Personal Skills | Project Skills |
|-------|----------------|----------------|
| Location | `~/.claude/skills/` | `.claude/skills/` |
| Scope | All of your projects | The current project |
| Version control | Not needed | Committed to Git |
| Team sharing | Not shared | Shared with everyone |
| Typical use | Personal habits, general-purpose tools | Project conventions, team process |

### Which one to reach for

**Personal skills:** [^S9]

- Document format conversion (Markdown → Word)
- The way you personally like tasks organized
- Your own code style preferences
- General tools you want in every project

**Project skills:**

- The team's code review standard
- The project's commit message format
- Scaffolding for a specific framework
- The project's deploy process

## Creating a project Skill

### Step 1: Create it in the project directory

Go to your project:

````bash
cd ~/projects/my-app

# Create the project skills directory
mkdir -p .claude/skills/commit-format

# Create SKILL.md
cat > .claude/skills/commit-format/SKILL.md << 'EOF'
---
name: commit-format
description: Rewrites a short commit message into the team's required format, with type, scope, and a detailed body
---

# Commit Message Formatting

Rewrite a terse commit message into the format the team agreed on.

## Team Convention

Commit message format:
```
<type>(<scope>): <subject>

<body>
```

**Types:**
- feat: new functionality
- fix: bug fix
- docs: documentation change
- style: formatting only (no behavior change)
- refactor: restructuring
- test: test-related
- chore: build or tooling change

**Scopes:**
- api: the API layer
- ui: the interface
- db: the database
- auth: authentication and authorization
- core: core logic

## Processing Steps

1. Read the original commit text and decide on the type and scope
2. Fill in the context that's missing (why the change was made, what it touches)
3. Emit it in the required format

## Output Format

```
<type>(<scope>): <subject>

<body>
- why the change was made
- which features or modules it affects
- related issue or PR, if there is one
```

## Example

**Input:** "fixed that login bug"

**Output:**
```
fix(auth): correct password validation on the login page

- Problem: validation failed when the password contained special characters
- Cause: the regex didn't escape special characters
- Impact: users with special characters in their password couldn't log in
- Related issue: #123
```
EOF
````

### Step 2: Commit it to Git

```bash
git add .claude/skills/commit-format/
git commit -m "feat(tooling): add commit message formatting Skill"
git push
```

### Step 3: Teammates pick it up

Everyone else on the team:

```bash
git pull
```

The Skill works immediately. There's nothing else to configure. [^S1]

## Managing Skills with Git

Once project skills live in Git, everything Git can do applies to them: [^S8]

### Version history

```bash
# See the history of a Skill
git log -- .claude/skills/commit-format/

# Roll back to an earlier version
git checkout abc123 -- .claude/skills/commit-format/

# Compare two versions
git diff main..feature-branch -- .claude/skills/
```

### Code-review the Skills themselves

**Reviewing a Skill matters as much as reviewing code.** [^S10]

When someone submits a new Skill or changes an existing one:

1. Check that the description is clear
2. Check that the instructions are specific enough
3. Test whether it actually behaves as intended
4. Decide whether it earns a place in the project (will it collide with an existing Skill?)

**Reviewing a Skill file in a PR:**

```markdown
## Review checklist

- [ ] description covers what it does and when to use it
- [ ] instructions are specific and executable
- [ ] input and output examples are included
- [ ] tested against at least 3 cases
- [ ] doesn't duplicate or conflict with an existing Skill
```

### Branching

**Keep experimental Skills on a feature branch:**

```bash
# Create the experiment branch
git checkout -b experiment/ai-refactor-skill

# Add the experimental Skill
mkdir -p .claude/skills/ai-refactor
# ... write SKILL.md

# Commit
git add .claude/skills/ai-refactor/
git commit -m "experiment: add AI-assisted refactoring Skill"

# Use it for a week; merge into main if it earns it
git checkout main
git merge experiment/ai-refactor-skill
```

## Team practices that hold up

### 1. Document them in the README

Documenting Skills is straightforward: list them in the project's root README or in `.claude/README.md`: [^S10]

````markdown
## Available Claude Skills

### commit-format
Rewrites a terse commit message into the team's format.

**Usage:** `/commit-format [original commit message]`

**Example:**
```
/commit-format fixed the login bug
```

### code-review
Reviews a code change against the team's standard.

**Usage:** `/code-review`, then paste the code or diff

**Note:** review output is advisory — significant changes still need a human reviewer
````

### 2. Agree on naming

Settle on one naming convention across the team: [^S8]

**Recommended:**

- Hyphens: `commit-format`, `api-doc-gen`
- Verb-noun or noun-verb: `format-commit`, `review-code`
- Short and clear: two or three words

**Avoid:**

- Numeric suffixes: `skill-1`, `helper-v2`
- Anything vague: `tool`, `helper`, `utility`
- Project abbreviation plus a number: `proj-skill-3`

### 3. Prune on a schedule

Review the set once a quarter: [^S8]

```bash
# List every project skill
ls .claude/skills/

# For each one, ask:
# - How many times was it used in the last 3 months?
# - Does it still match how the team works?
# - Has another Skill replaced it?
```

**A Skill that barely gets used should be improved or deleted.** A pile of unused Skills makes it harder for Claude to find the one that actually applies.

### 4. Announce changes

**This one matters:** when you change an existing Skill, post it in the team channel.

```
📢 Skill update: code-review

Changes:
- Added checks for React Hooks rules
- Lowered the function length threshold (50 lines → 40)

Impact:
- Code that passed before may now get flagged
- Worth re-reviewing recent PRs

Questions: @dana
```

## Composing Skills

**Composing Skills means chaining several of them to handle one larger task:** [^S1]

```
/commit-format fixed the login bug

(Claude returns the formatted commit)

/code-review

(paste the code you just changed)
```

**Or reference one Skill from inside another:**

```markdown
## Steps

1. Use the commit-format Skill to format the commit message
2. Use the code-review Skill to check the code changes
3. Combine both results into a PR description
```

This is where Skills get their reach: small, single-purpose Skills combine into larger workflows. The Anthropic engineering guide puts it this way: "Instead of building fragmented, custom-designed agents for each use case, anyone can now specialize their agents with composable capabilities." [^S3]

## Past the basics: where to go next

You now have the core skill set. From here, a few directions worth exploring.

### Optional frontmatter fields

This course only used `name` and `description`. There are more: [^S5]

- **`model`**: which model this Skill runs on (when you need stronger reasoning)
- **`allowed-tools`**: restrict the Skill to specific tools
- **`disable-model-invocation`**: stop Claude from loading it automatically, so it's manual-only

Of the three: `model` picks the model, `allowed-tools` draws the permission boundary, and `disable-model-invocation` turns off automatic triggering and leaves manual invocation only.

**When to use them:**

- Expensive operations (calling an external API) → `disable-model-invocation`, so it can't fire by accident
- Tasks that need careful reasoning → `model: claude-opus-4`
- Security-sensitive Skills → `allowed-tools` to limit what they can touch

**The full field list is in the official docs:** https://code.claude.com/docs/en/skills [^S1]

### Skills plus MCP servers

**MCP (Model Context Protocol) servers supply tools; Skills supply workflow knowledge.** [^S7]

For example:

- An MCP server exposes a `read_database` tool
- A Skill teaches Claude how to use that tool to run the "generate the monthly report" workflow

Put together, Skills become the bridge between Claude and your external systems. [^S7]

### Community Skills

To see what other people have built:

- Search GitHub for "claude skills"
- https://github.com/travisvn/awesome-claude-skills [^S1]

**Before you run someone else's Skill:**

- Read the whole SKILL.md and understand what it does
- Try it in a scratch project, not on production code
- Look for anything risky (running scripts, network access, modifying files)

<!-- exercises -->
## 💻 Exercises

### Level 1: Create your first project Skill

Pick a project you're currently working on and add a project skill to it:

1. Create `.claude/skills/[skill-name]/` in the project directory
2. Write a Skill that's specific to the project (commit format, deploy process, test generation, whatever fits)
3. Commit it to Git
4. Document it in the project README

<!-- rubric -->
- The Skill directory is under the project's `.claude/skills/`
- SKILL.md is complete (frontmatter plus instructions)
- It's committed to Git
- The README explains how to use it

<!-- answer -->
An example (a deploy check Skill):

**Create it:**
```bash
cd ~/projects/my-web-app
mkdir -p .claude/skills/deploy-check
cat > .claude/skills/deploy-check/SKILL.md << 'EOF'
---
name: deploy-check
description: Pre-deploy checklist that verifies environment variables, dependency versions, test coverage, and configuration files
---

# Pre-Deploy Check

## Checks

### 1. Environment variables
- Are all required environment variables set (DATABASE_URL, API_KEY, and so on)
- Is any sensitive value hardcoded in the source

### 2. Dependencies
- Are versions in package.json pinned (no `^` or `~`)
- Any known vulnerabilities (run `npm audit`)

### 3. Tests
- Unit test coverage above 80%
- Do the integration tests on the critical paths pass

### 4. Configuration
- Is the production configuration correct
- Is the log level set to INFO or ERROR (not DEBUG)

## Output Format

### ✅ Passed
- [check]

### ❌ Failed (blocks deploy)
- [check] - [problem] - [how to fix]

### ⚠️ Warning (fix recommended, doesn't block)
- [check] - [problem]
EOF

git add .claude/skills/deploy-check/
git commit -m "feat(tooling): add pre-deploy check Skill"
```

**Document it (in the project README):**
```markdown
## Pre-deploy check

Run `/deploy-check` to work through the full pre-deploy checklist.

**What it covers:**
- Environment variable configuration
- Dependency security
- Test coverage
- Production configuration

Only deploy to production once every check passes.
```

<!-- hint -->
Stuck for a project Skill? Start with the questions the team asks most: "how do I deploy this?", "what's the commit message format?", "how do I write the tests?"

<!-- hint -->
Your first project Skill doesn't need to be elaborate — a "team conventions quick reference" is already useful

### Level 2: Review a Skill PR

A teammate has opened a PR adding a new Skill. Write the review.

**The PR contents:**
```markdown
---
name: helper
description: Helps process data
---

# Helper

A tool for processing data.

## Steps

1. Read the data
2. Process it
3. Output the result
```

**Write your review, naming at least 3 problems.**

<!-- rubric -->
- Identifies the problem with the name
- Identifies the problem with the description
- Identifies the problem with the instructions
- Gives concrete suggestions for fixing each
<!-- answer -->
A sample review:

**Problem 1: the name is too vague**

`helper` says nothing about what the Skill does. Use something descriptive instead:

- If it sanitizes user input: `sanitize-user-input`
- If it converts between data formats: `transform-data-format`

**Problem 2: the description is unusable**

"Helps process data" is so broad that Claude has no way to tell when this Skill applies.

It needs to say:

- Which data (user input? CSV files? API responses?)
- What it does to it (validate? convert? clean?)
- When to use it (on data import? on form submission?)

**Problem 3: the instructions have no detail at all**

"Read the data", "process it", "output the result" — none of that is executable. It needs:

- The input format
- The actual steps in "process it" (validate what, convert what, filter what)
- The output format
- At least one input/output example

**Recommendation: don't merge. Ask the author to supply the above and resubmit.**

<!-- hint -->
A good Skill PR includes a complete SKILL.md, results from at least 2 test cases, and a description of when the Skill applies

<!-- /exercises -->

## Recap

- **Personal skills (`~/.claude/skills/`) are for your own habits**; project skills (`.claude/skills/`) are for working as a team [^S9]
- **Project skills go into Git**, teammates get them automatically, and you version and branch them like any other file
- **Team practices**: document them, agree on naming, prune on a schedule, announce changes
- **Skills compose**: small single-purpose Skills combine into larger workflows [^S3]
- **Where to go next**: optional frontmatter fields, MCP server integration, community Skills

## You've finished the course

You can now:

- ✅ Explain how Skills work and where they apply
- ✅ Write a well-structured SKILL.md
- ✅ Run a systematic testing and debugging process
- ✅ Organize a more involved Skill
- ✅ Apply the team practices that keep shared Skills healthy

**What to do next:**

1. **Write a Skill today**: pick the task you explained three times this week and turn it into one
2. **Use it for a week**: track how often you invoke it, what breaks, how much time it saves
3. **Iterate**: add the checks you missed, adjust the output format based on what actually happened
4. **Share it**: if it's genuinely useful, promote it to a project skill

**Remember:** a good Skill isn't written once and finished — it gets shaped by being used. [^S8][^S10]

Now go build the workflows you keep re-explaining.
