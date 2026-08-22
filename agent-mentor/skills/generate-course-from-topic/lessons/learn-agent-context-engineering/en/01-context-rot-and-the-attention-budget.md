# Lesson 1: Why a Fuller Window Works Worse

> Lesson objectives:
> - Describe what actually occupies your agent's context window before you type anything.
> - State the measured relationship between input length and recall, with the setting the measurement came from.
> - Name which of four long-context failure modes matches a symptom you have seen in your own run.
> - Explain why a larger context window does not remove the problem.
>
> Prerequisites: You have run an agent on a task long enough to notice it degrade | Previous [<< Course contents](./README.md) | Next [02 >>](./02-write-select-compress-isolate.md)

## Hour three is worse than hour one

You know the shape of this. The first half hour is good. The agent reads the right files, makes the change you asked for, explains itself. Then somewhere past the middle the run gets worse: it re-reads a file it already read, re-derives a decision you settled together, quietly stops honouring a constraint you gave at the start, and ends up somewhere adjacent to the thing you wanted.

The intuitive explanation is that it "ran out of room" or "got tired." Neither is what happened. Nothing hit a limit and failed — the window still had space, no error appeared, and the model was the same model it was at minute five. What changed is the amount of material it was reading each turn, and that turns out to be enough on its own.

This lesson is about the mechanism behind that curve, because every technique in the rest of the course is a response to it. Before you can decide what to keep out of the window, you need an accurate picture of what is in it and what its presence costs.

## Explanation

### The window is already substantially full

Before your first message, a coding agent has loaded a system prompt, whatever project instructions you have on disk, its own accumulated memory file, the names of available tools, and one-line descriptions of any skills it can invoke.[^S10] Then the work starts, and the largest contributions arrive: file contents, command output, test logs, search results.

Anthropic's own walkthrough of a Claude Code session lists what loads before you type anything: "CLAUDE.md, auto memory, MCP tool names, and skill descriptions all load into context."[^S10] The page is explicit that its token figures are representative rather than measured, so treat them as a shape rather than a scoreboard — the useful takeaway is which categories exist, not what any of them costs in your session.

The thing to notice is that most of these are invisible to you. You see a one-line "Read auth.ts" in your terminal; the model sees the file. Your sense of how full the window is comes from how much *you* have typed, and that is the smallest contributor on the list.

### Context is a budget, not a container

The natural mental model — a container that works fine until it overflows — is wrong in a way that matters. Anthropic's context-engineering write-up states the alternative directly: "LLMs have an 'attention budget' that they draw on when parsing large volumes of context. Every new token introduced depletes this budget by some amount."[^S1] The conclusion they draw: "Context, therefore, must be treated as a finite resource with diminishing marginal returns."[^S1]

The name for the effect is **context rot**: "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases."[^S1] Not at the limit. Continuously, as the window fills.

That is a vendor stating a design principle. The measurement behind it is worth looking at separately, because the size of the effect is the part people get wrong in both directions.

### What the measurements actually say

Chroma's context-rot study ran 18 models — the Claude 4, GPT-4.1, Gemini 2.5 and Qwen3 families — across an extended needle-in-a-haystack design plus two other tasks, varying input length while holding the task fixed. The headline: "LLMs do not use their context uniformly; instead, their performance grows increasingly unreliable as input length grows," and "across all experiments, model performance consistently degrades with increasing input length."[^S2]

One of their comparisons is the one to carry with you. On LongMemEval, they ran the same questions two ways: a focused prompt containing only the relevant material, averaging about 300 tokens, and the full prompt at about 113k tokens. The focused version scored significantly higher.[^S2] Same question, same model, same answer sitting in the context both times — the only difference was how much else was in there.

The obvious objection is that the long version made the model *find* the answer first, so this measures retrieval, not reasoning. A peer-reviewed result closes that objection. Researchers at EMNLP 2025 tested 5 models on math, question answering, and coding while padding the input, and found that "even when models can perfectly retrieve all relevant information, their performance still degrades substantially (13.9%–85%) as input length increases but remains well within the models' claimed lengths."[^S3] They then removed the distraction entirely — replacing the filler with whitespace, and in a further condition masking it so the model could attend only to the relevant tokens — and the drop survived both.[^S3]

Read that range carefully. 13.9%–85% is the span across their whole grid of models and tasks at the longest padding they tested (up to 30,000 filler tokens), not a number to expect on your task. In their per-task table, one model lost 7 points on grade-school math and 48 points on a variable-tracking task at the same padding length.[^S3] The reliable claim is the direction and the fact that length alone causes it. The magnitude depends entirely on what you are asking.

### This is not a solved problem in current models

A fair question at this point: those measurements are from 2025, and windows have grown since. Has the problem been engineered away?

The most recent evidence available says no. A May 2026 study used current frontier models — Opus 4.6, GPT 5.4, and Gemini 3.1 — as classifiers reading long agent transcripts, and found they "miss these actions 2x to 30x more often when they occur after 800K tokens of benign activity than when they occur on their own."[^S6] On one dataset, recall for Opus 4.6 with thinking enabled "decreases from 98.6% to 88% when 800k tokens of benign actions are prepended."[^S6]

Those are extreme conditions chosen to expose the effect — 800K tokens of padding, on a detection task, with the 2x-30x span running across attack types. Do not carry the numbers to your own work. Carry the finding: as of 2026-08-23, the degradation is a property of the current generation, measured on it, not a limitation of older models.

Anthropic makes the forward-looking version of the same point: "it's likely that for the foreseeable future, context windows of all sizes will be subject to context pollution and information relevance concerns."[^S1] A bigger window buys you room. It does not buy you attention.

### Four ways it goes wrong, and they look different

"The agent got worse" collapses several distinct failures into one complaint. Drew Breunig's taxonomy separates them, and the names are worth having because each one has a different fix:[^S8]

| Failure | Definition | What it looks like in your run |
|---|---|---|
| Poisoning | "when a hallucination or other error makes it into the context, where it is repeatedly referenced" | It invented a function name once, and now every file it writes calls it |
| Distraction | "when a context grows so long that the model over-focuses on the context, neglecting what it learned during training" | It keeps re-applying the pattern from the earlier files instead of doing the obvious thing |
| Confusion | "when superfluous content in the context is used by the model to generate a low-quality response" | It reached for an irrelevant tool because the tool was there |
| Clash | "when you accrue new information and tools in your context that conflicts with other information in the context" | You corrected an approach and it keeps half-following the old one |

This taxonomy is one person's framework on a personal blog, not a standard — treat the four names as vocabulary rather than as settled science. What makes them worth using is that they point at different repairs. Poisoning needs the bad token *removed*, and no amount of new instruction fixes it while the error stays in the history. Confusion needs the irrelevant material *not present*. Clash needs the superseded version gone, not overridden.

### Your symptoms have a documented signature

The specific things you noticed — repeating work, losing the goal — are the documented failure signature of long agent context, not a vague impression.

A December 2025 study built web-agent tasks with dependent subtasks and then padded the space between them with irrelevant trajectories, "creating contexts ranging from 25,000 to 150,000 tokens."[^S5] Success rates dropped "from 40-50% in baseline conditions to less than 10% in long context scenarios," and the error analysis names the mechanism: "agents primarily fail due to getting stuck in loops and losing track of original task objectives."[^S5]

That padding is deliberately adversarial noise, so the collapse to under 10% is an upper bound on the effect, not a forecast for a well-managed window. But the failure *modes* they measured are precisely the two you came here with, which is worth knowing: you are not misreading your agent, and the fix is not better prompting.

```agentmentor-check
{
  "id": "context-engineering-rot-length-vs-retrieval",
  "label": "Separate length from retrieval failure",
  "prompt": "An agent has 60k tokens of history. You ask it a question whose answer is in a file it read 40k tokens ago. It quotes the right line from that file — and then reasons from it to a wrong conclusion it would have got right in a fresh session. Which reading of this is supported by the evidence in this lesson?",
  "whyHere": "The most common repair after learning about context rot is a retrieval fix: better search, better chunking, pin the file. That is the right fix only if the failure is retrieval. This checks whether the reader noticed that the EMNLP result specifically rules out retrieval as the sole explanation.",
  "copyPurpose": "Have the agent check whether I am treating every long-context failure as a retrieval problem when the evidence says length alone degrades reasoning after retrieval succeeds.",
  "mode": "single",
  "choices": [
    {
      "id": "retrieval",
      "text": "Retrieval degraded — it found the line by luck and does not really have it in working memory",
      "correct": false,
      "feedback": "The quote is evidence that retrieval succeeded; there is nothing left to fix on the retrieval side. The EMNLP study built exactly this condition — perfect retrieval, long input — and still measured substantial degradation, which is why retrieval cannot be the whole account here."
    },
    {
      "id": "length",
      "text": "Length itself degraded the reasoning that came after the successful retrieval",
      "correct": true,
      "feedback": "This is the condition the EMNLP work isolated: it held retrieval perfect, padded the input, and the drop persisted even when the filler was whitespace and even when the irrelevant tokens were masked out entirely. Retrieval and reasoning degrade separately, and fixing search would not have touched this failure."
    },
    {
      "id": "distraction",
      "text": "Something in the intervening 40k tokens distracted it — remove the distractor and the reasoning recovers",
      "correct": false,
      "feedback": "Plausible, and distraction is real, but it cannot be the whole mechanism: the same drop appeared when the padding was replaced with whitespace carrying no competing content, so there was nothing to be distracted by. Removing distractors helps, and it does not get you back to short-context accuracy."
    },
    {
      "id": "window-limit",
      "text": "It is near the window limit, so the earliest material is being pushed out",
      "correct": false,
      "feedback": "Nothing was pushed out — the model quoted the line, so the file is still there. The measurements that matter here were taken well inside the models' claimed context lengths, which is the point: degradation starts long before the limit rather than at it."
    }
  ]
}
```

## Worked example: reading a degraded run

Here is a session shape you will recognise, annotated with what the window looked like at each point.

```text
Turn 1   You: "Fix the 401 after token refresh. Don't touch the middleware —
         I'm rewriting it this week."
         Window: system prompt + CLAUDE.md + memory + tool names + your 30 tokens.

Turn 4   Agent reads auth.ts, tokens.ts, middleware.ts, auth.test.ts.
         Window: + roughly the entire text of four files. You saw four one-line
         "Read" notices. The model saw four files.

Turn 9   Agent runs the test suite. Fails. Runs it again with verbose output.
         Window: + two full test logs, the second much larger than the first.
         Neither will be read again. Both stay.

Turn 15  Agent tries an approach, you say no, it tries another.
         Window: + the abandoned approach, still present, still readable,
         still competing with the correction.  ← clash

Turn 22  Agent proposes a fix that edits middleware.ts.
         The constraint from turn 1 is 20,000 tokens back, in a window now
         dominated by file text and logs.  ← distraction
```

Three separate things went wrong, and only one of them is about forgetting.

The middleware constraint at turn 22 is the closest to genuine forgetting, and even that is not erasure — the sentence is still in the window. It is competing for attention against four files and two test logs, in a position that is neither the beginning nor the end of the context. Position matters here: models are measurably better at using material at the very start or the very end of their input than in the middle.[^S4] That finding is from 2023 and the models it tested are long superseded, so take the U-shape as a durable design principle rather than as a current benchmark — but the design implication holds, and it is why "I said that at the start" does not protect an instruction.

The abandoned approach at turn 15 is not forgetting at all. Both versions are present with equal standing, and nothing marks the first one as dead. That is clash, and the repair is removal rather than restatement.

The two test logs at turn 9 are the cheapest problem and the biggest number. Neither will ever be read again. They are pure occupancy — and being useless does not make them free, since every token draws on the same budget.[^S1] This is the category the next lesson handles first, because it is the one where you get the most window back for the least thought.

## Your turn: classify three symptoms

For each symptom below, name the failure mode and say what would actually repair it. Answers follow.

```text
A. Forty minutes in, the agent starts calling a helper `formatUserRecord()`.
   That function does not exist. It hallucinated it once while sketching an
   approach, and now every new file it writes calls it.

   Failure mode: ____________   Repair: ____________

B. You gave the agent access to twelve MCP tools for the project. On a task
   that needs only file reads, it makes a database query first.

   Failure mode: ____________   Repair: ____________

C. Two hours in, on a big refactor, the agent starts producing code in the
   style of the legacy files it read early on, even in new modules where the
   project's current conventions clearly apply.

   Failure mode: ____________   Repair: ____________
```

Reference answers:

```text
A. Poisoning. The error is in the history and gets re-read every turn, so it
   is self-reinforcing. Telling it "that function doesn't exist" adds a
   correction without removing the cause — you now have both in the window,
   which is clash on top of poisoning. The repair is to get the bad token out:
   clear and restart from a summary you write, which is Lesson 3's territory.

B. Confusion — superfluous content in the window being used because it is
   there. The repair is absence, not instruction: the tool schemas should not
   be loaded for a task that does not need them. "Don't use the database"
   spends tokens to counteract tokens.

C. Distraction — the context is long enough that the model over-weights it
   relative to what it knows. This one is not a mistake you can point at, and
   it is the hardest to notice from outside. The repair is length: a fresh
   window with only the current conventions in it.
```

The pattern worth extracting: **in three of these, the repair is removal, and in none of them is the repair a better instruction.** That is the inversion this course is built on. Once material is in the window it is being read every turn, and adding a sentence to counteract it leaves the original in place and makes the window longer. This framing — that adding instruction is the wrong reflex for a context problem — is the course's own synthesis of the mechanisms above; no single source states it as a rule.

<!-- exercises -->
## 💻 Exercises (point these at your own real environment)

### Level 1 (warm-up)

Open your agent tool on a project you actually work in, start a session, and before typing any task, find out what is already loaded. In Claude Code that is the `/context` command, which gives "a live breakdown by category with optimization suggestions."[^S10] If your tool has no equivalent, list from its documentation what it loads at startup and estimate each item's size from the file lengths on disk.

Write down the categories and their sizes, then answer: which of them did you know were there, and which of them are load-bearing for the task you were about to start?

<!-- rubric -->
- You have a written list of what occupies the window before your first message, with a size against each item.
- At least one item on the list is something you did not know was being loaded.
- For each item you name whether the task you were about to run actually needs it.
- You can state what fraction of the pre-task window is instructions versus tool definitions versus memory.
<!-- answer -->
A completed list looks like: system prompt (not editable, not your problem), project CLAUDE.md (yours — check whether it has grown past what a task needs), global CLAUDE.md (yours, applies everywhere, most likely to hold stale preferences), auto memory (accumulated across sessions — worth reading, since it is the file you never wrote and never reviewed), tool names and skill descriptions (a function of what you have installed, not of this task). The common surprise is the last two: people install tools and skills over months and never look at the standing cost. The judgment to reach is that per-task relevance varies wildly — a documentation-writing session is carrying database tool schemas for nothing. If your tool exposes no breakdown at all, that is itself the finding, and the fallback is to note which files it documents as auto-loading and check their line counts.
<!-- hint -->
Look for the largest single item first. In most projects it is either the project instructions file or the accumulated tool definitions, and both are things you can change.
<!-- hint -->
"Load-bearing for this task" is a harder test than "useful in general." A rule about database migrations is useful in general and is pure occupancy in a CSS session.

### Level 2 (advanced)

Take a real session of your own that went badly on a long task — one you remember, or one you can find in your tool's history. Reconstruct its timeline the way the worked example does: what entered the window at each stage, and where the run started degrading. Then classify every failure you can identify against the four modes.

Write one sentence per failure naming the mode and the repair. For at least one, say explicitly whether you originally tried to fix it by adding an instruction.

<!-- rubric -->
- Your timeline names what entered the window at each stage, not only what you asked for.
- You identify at least two distinct failures rather than one general "it got worse."
- Each failure is classified, and the classification is justified by what was in the window rather than by the symptom alone.
- At least one repair is removal rather than instruction, and you can say what specifically would be removed.
- You name one thing that entered the window and was never read again.
<!-- answer -->
A good reconstruction usually finds that the largest occupant was something nobody chose — a verbose test log, a file read in full to check one function, a search result set. A typical entry reads: "Turn 12, the agent read a 900-line config file to check one flag; that file stayed in the window for the remaining hour and was never consulted again. Pure occupancy." The classification that most often gets revised on a second look is a suspected forgetting that turns out to be clash: the instruction was still there, but so was a superseded plan, and the model was following the plan. A common mistake here is stopping at the last visible failure — the wrong output at the end — and classifying only that; the failures that produced it usually started twenty turns earlier and were survivable individually. If your session genuinely had only one failure mode, say so and name what kept the others away, because that is a reusable finding about how you were working.
<!-- hint -->
Start from the moment you first thought "that's odd" rather than from the moment the output was wrong. The distance between those two is usually where the useful evidence is.
<!-- hint -->
For each failure ask: was the information it needed missing from the window, or present and outcompeted? Those are different problems and only the first is about forgetting.
<!-- /exercises -->

## What the mechanism implies

You now have an accurate picture of the constraint. Recall degrades continuously as the window fills, and this is measured on current models rather than inherited from older ones. Length alone does it, with retrieval held perfect and distraction removed. The failures arrive in four distinguishable shapes, and for most of them the repair is taking something out rather than putting an instruction in.

The unsatisfying part is that nothing here tells you what to take out. "Curate the window" is not an action, and the reflex it produces — trimming whatever looks big — will delete things you needed while leaving things you did not.

The next lesson is the sorting step. There are four things you can do with any piece of context, they cost wildly different amounts, and most people reach for the expensive one first.
