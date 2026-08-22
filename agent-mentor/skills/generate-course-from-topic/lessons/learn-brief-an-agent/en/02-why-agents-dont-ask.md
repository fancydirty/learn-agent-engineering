# Lesson 2: Silence Instead of Questions

> Lesson objectives:
> - Explain what an agent does with a blank instead of asking about it.
> - State why detecting underspecification is harder for a model than answering a question about it.
> - Write the instruction that moves an agent from assuming to asking, and place it before the run.
>
> Prerequisites: Lesson 1's filter, and one of your own requests taken apart | Previous [<< 01](./01-the-gap-in-a-request.md) | Next [03 >>](./03-naming-done-first.md)

## It had the option to ask you

Here is the part of the last lesson that should still be bothering you. When an agent hits a genuine fork — two defensible readings, nothing in the project settling it — you are usually sitting right there. Asking costs it one sentence. Guessing wrong costs an hour of work and a wrong result.

It guesses anyway, almost every time, and it does not tell you it guessed.

That behaviour is not a bug in your phrasing, and it is measurable. This lesson covers what happens inside the model instead of a question, why the hard part is noticing the gap rather than asking about it, and what actually changes the behaviour — which turns out to be one sentence you write before the run, not a better way to phrase the request itself.

## Explanation

### There is no blank state to be in

A model producing text has no mode that corresponds to "I don't know this part yet." Every position produces the next token. Faced with a request that omits a needed value, the machinery does not stall at the omission — it continues, and continuing means producing something in that slot.

Researchers studying tool-calling agents on deliberately imperfect instructions state the cause directly: "due to the next-token prediction training objective, LLM agents tend to arbitrarily generate the missed argument, which may lead to hallucinations and risks."[^S2] The word doing the work is *arbitrarily*. The value is not reasoned to, and it is not flagged. It is produced, because producing is what the process does.

The practical consequence is the one that keeps catching people out. An **invented value** — a specific choice the agent produced for a decision your request left open — is indistinguishable, in the output, from a value you supplied. It appears in the work with the same confidence as everything you actually specified. Nothing in the result is marked "I made this part up."

That is why "the agent misunderstood me" is usually the wrong description. Understanding was fine. There was simply nothing there, and a slot that had to be filled.

### Detection is the hard step, not the asking

You might expect the fix to be prompting for a better clarifying question. The evidence points somewhere less obvious: models are reasonably good at asking useful questions once they have decided to ask, and quite bad at deciding. The weak step is detection — noticing that something is missing at all.

Ambig-SWE tested this by splitting the problem into steps: detecting that information is missing, asking a targeted question about it, and using the answer.[^S1] The headline finding on the first step: "models struggle to distinguish between well-specified and underspecified instructions."[^S1] The study built its underspecified cases by summarizing complete software issues down to versions with the details stripped out — and models shown a random mix of the full and stripped versions largely could not tell which was which, even though the two differ visibly in length and detail.[^S1]

Sit with the shape of that. A gap is defined by what is absent, and absence has no surface. When you read a request, you compare it against a mental model of the task — you notice the missing thing because you know the shape it should have filled. A model reading a short, fluent, plausible request has a fluent request in front of it. It reads as complete because complete is what it looks like.

This is also why "just phrase it better" does not solve the problem on its own. Rewriting a request only helps if you already know which part is thin. The part you cannot see is the one still missing after the rewrite.

### Interaction works, when it happens

The other half of the finding is more encouraging, and it is what makes this lesson worth acting on.

When the same models were put in a setting where the request was underspecified *and* interaction with a user who held the full information was enabled, performance rose sharply. Ambig-SWE reports "significant improvements in performance, up to 74% over the non-interactive settings."[^S1]

That number needs its setting attached, because it is an upper bound from a controlled comparison and not a rate you should expect on your own work. The study ran the 500 issues of a standard software benchmark in three conditions: **Full**, the original complete issue with no interaction; **Hidden**, a summarized version with the details stripped and no interaction; and **Interaction**, the same stripped version with a simulated user holding the full issue, where the agent was prompted to make interaction compulsory.[^S1] The 74% is the largest relative gain of Interaction over Hidden among the models tested, and the gain varied considerably across them.[^S1] The comparison is also generous to interaction in a way real life is not: the simulated user always had the missing answer, always responded, and never got tired.

The transferable finding is the direction, which held for every model tested: an agent that asks about what it is missing does substantially better than the same agent guessing, on the same task. What is worth taking from the number specifically is that the gap between guessing and asking is large — large enough that a single sentence enabling questions can be worth more than any amount of rewriting the request itself.

### Interaction has to be switched on

Now the sentence that matters, because there is a catch in how the study got interaction to happen at all.

The models did not ask on their own. Ambig-SWE is explicit: "LLMs default to non-interactive behavior without explicit encouragement."[^S1] In the Hidden condition, where no interaction instruction was given, every model tested simply proceeded.[^S1] In the Interaction condition, the researchers had to modify the prompt "to make interaction with the user compulsory."[^S1]

So the default is silence, and the instruction that changes it is not part of your request — it is a standing rule about how to handle a request. Anthropic's Claude Code documentation packages the same move as a named workflow, recommending that "for larger features, have Claude interview you first,"[^S3] with a starting prompt that asks the agent to interview you about "technical implementation, UI/UX, edge cases, concerns, and tradeoffs" and to "keep interviewing until we've covered everything, then write a complete spec."[^S3]

Notice what that inverts. Instead of you trying to anticipate every blank — which Lesson 1 showed is hard, because your own blanks are invisible to you — you make the agent generate the questions, and you supply the answers. The asymmetry is in your favour: you are bad at finding your own gaps and good at answering questions about your own intent.

A caution on the questions you get back. Question quality varies, and Ambig-SWE found that "the most effective questions are specific, actionable, and task-level, while vague prompts or implementation details recoverable from the codebase add little value."[^S1] Some models burned interaction turns asking for file locations they could have found by looking — the same recoverable-versus-decision split from Lesson 1, seen from the agent's side.[^S1] If every clarifying question you get back is a recoverable one, say so and ask for the decisions instead.

```agentmentor-order
{
  "id": "brief-an-agent-ask-first-order",
  "label": "Order the steps that produce an asked question",
  "prompt": "You want an agent to surface the blanks in a feature request rather than guessing at them. Put these four steps in the order that actually gets you there, from the one that must happen first to the one that depends on all the rest.",
  "whyHere": "Readers reliably put 'write the request carefully' first, which is the step their own invisible blanks defeat, and they place the interview after the request rather than in front of it. This checks the dependency, not the vocabulary.",
  "copyPurpose": "Have the agent check whether I'm trying to anticipate my own blanks by rewriting the request, instead of putting the interview step in front of it.",
  "items": [
    { "id": "instruct", "text": "Give a standing instruction that questions come before work: interview me, don't assume" },
    { "id": "rough", "text": "State the request roughly, in the words you'd naturally use" },
    { "id": "answer", "text": "Answer the questions that come back, and push back on ones the project could answer" },
    { "id": "spec", "text": "Have the answers written into a brief, and start the work from that" }
  ],
  "correctOrder": ["instruct", "rough", "answer", "spec"],
  "feedback": "The instruction has to come first because the default is silence: without it, a rough request gets executed rather than questioned. Once questions are enabled, a rough request is enough — its gaps are what the interview is for — and answering them produces the material the brief is written from.",
  "feedbackWrong": "Check which step the others depend on. Polishing the request before enabling questions spends effort on the blanks you can already see, and leaves the interview nothing to surface but the ones you couldn't."
}
```

## Worked example: the same request, twice

A request with one genuine fork in it, sent cold — a one-shot run, with no questions and no checkpoint before the work:

```text
YOU:  Add a "recently viewed" section to the product page, showing the last
      few items the user looked at.

AGENT: [starts work]
       ...
       Done. The product page now shows a "Recently viewed" row with the
       last 5 products, stored in localStorage, excluding the current product.
```

Three invented values, none announced: **5** items, **localStorage** as the store, and **excluding the current product**. Each is a reasonable choice. The second is the one that matters — localStorage means the list does not follow the user to their phone, which may be exactly wrong for a logged-in shopping experience, and you will not find out until someone complains.

Now the same request with the interview instruction in front of it:

```text
YOU:  Before doing any work on what follows, ask me about anything that has
      more than one reasonable answer and that you can't settle by reading
      the codebase. Ask about edge cases and tradeoffs I may not have
      considered. Don't ask about things you can find by looking. When we're
      done, write the answers into a short brief and start from that.

      The request: add a "recently viewed" section to the product page,
      showing the last few items the user looked at.

AGENT: Four questions before I start:

       1. Should the list persist across devices for logged-in users, or is
          per-browser storage acceptable? This decides whether it needs a
          backend table or just localStorage.
       2. How many items, and does the current product appear in its own
          list?
       3. What should the section show for a first-time visitor with no
          history — hide entirely, or show a fallback like "popular now"?
       4. Does "viewed" mean the page loaded, or the user stayed some
          minimum time? A bounce currently counts as a view elsewhere in
          your analytics.

YOU:  1. Cross-device for logged-in users; localStorage is fine for guests.
      2. Six, and exclude the current product.
      3. Hide entirely. Don't add a fallback.
      4. Page load counts. Keep it consistent with analytics.
```

Question 4 is the one to notice. You were not going to think of it. It is not a blank you were carrying an answer to and forgot to state — it is a decision you had not yet made, surfaced by something that had just read your analytics code. That is the class of gap the interview finds and rewriting cannot: the ones that are not in your head either.

Question 3 is the second-best line in the exchange, for a different reason. "Hide entirely. Don't add a fallback." took you four seconds. Left unasked, the agent would have built a fallback — a small feature you never wanted, that now needs maintaining, that nobody will remember asking for. Lesson 5 is about that failure mode in general.

One honest note on cost: this exchange took about two minutes. For a one-line change it is not worth it, and the same documentation says as much, reserving the interview for "larger features."[^S3] The judgment call is whether a wrong guess would cost you more than the questions do.

## Your turn: predict the invented values

Below is a request sent cold, with no interview. Before reading the agent's report, write down the three values you expect it to invent, and which one you think will be wrong.

```text
Request sent:  "Add a weekly summary email for account admins."

The three values I expect it to invent:
  1. _______________________________________________
  2. _______________________________________________
  3. _______________________________________________

The one most likely to be wrong for my situation:  __________
Why: ____________________________________________________
```

Reference answer:

```text
  1. WHICH DAY AND TIME it sends — Monday morning is the near-universal guess.
  2. WHAT'S IN IT — some plausible metrics bundle: new users, activity,
     maybe billing. Invented wholesale, since nothing in a codebase says
     which numbers an admin cares about.
  3. WHO COUNTS AS AN ADMIN — every user with the admin role, including
     deactivated ones and the internal support accounts.

Most likely to be wrong:  #3.

Why: #1 is trivially correctable after the fact. #2 you'll notice immediately
     on the first send and can iterate on. #3 is wrong in a way that's
     invisible until it isn't — an email goes to eleven people who shouldn't
     have received it, and by the time you find out, it has been sent.
```

The ranking is the point of the exercise, not the list. Invented values are not equally dangerous, and the dangerous ones share a property: **the wrong value produces an effect you cannot take back or cannot see**. A wrong send day is visible and reversible. A wrong recipient list is neither.

That gives you a way to spend your effort. You cannot pre-answer every blank, and Lesson 1 showed you cannot even see them all. But you can look at your request and ask which blanks, filled wrong, would produce something irreversible or invisible — and put those few in the brief explicitly rather than trusting the interview to surface them.

```agentmentor-action
mode: confusion_breaker
label: Have my request read back before any work starts, and see which values got invented
description: Sends a real request of yours to an agent under an instruction to name every assumption it would have to make, so you can see the invented values before they turn into work rather than after.
purpose: Find out which decisions in one of my own requests an agent would fill in silently, and check whether any of them would have been wrong.
rules:
  - Ask me to paste one real request I was about to send, unedited.
  - Do not do the task. Only list the values you would have to invent to start it, and mark which ones the project could settle for you.
  - Then ask me, one at a time, what my intended value was for each — do not offer options first, since a suggested answer replaces the one I was holding.
  - After each answer, tell me plainly whether your default would have matched it.
  - At the end, name only the assumptions where your default and my intent differed. Those are the lines my brief needs; the rest are not worth writing.
```

<!-- exercises -->
## 💻 Exercises (point these at your own real environment)

### Level 1 (warm-up)

Take the request from Lesson 1's Level 1 exercise — the one that came back wrong — and run it through an agent with the interview instruction in front of it. Do not let it do the work. Compare the questions you get back against the S-marked blanks you listed last lesson.

How: open a fresh session so no prior context supplies answers for you. Paste the interview instruction, then the original unedited request. Write down which questions matched blanks you had already found, which found something new, and which asked about something recoverable.

<!-- rubric -->
- You used the original request text, not an improved version.
- You classified every question into: matched a blank I found, found a new one, or asked about something recoverable.
- At least one question surfaced a decision you had not made yet, rather than one you had made and omitted.
- You can state whether the interview would have prevented the wrong result you got the first time.
<!-- answer -->
A useful outcome names the class each question fell into, since that tells you where your own blind spot is. For example: "Six questions. Three matched blanks I'd already listed (auth scope, error display, whether to add tests). Two were recoverable — it asked which test framework and where the config lives, both of which are in the repo, so I told it to look. One was new and would have saved me the whole failed run: it asked whether the migration needed to be reversible, which I had not considered, and my answer was yes." If every question matched a blank you had already found, your Lesson 1 analysis was strong and the interview added confirmation rather than discovery — record that honestly, and note that the interview's value on this task was low. If most questions were recoverable, your instruction needs the "don't ask about things you can find by looking" clause strengthened, or the agent lacked access to the project.
<!-- hint -->
Judge each question by asking where its answer lives: in your head, in the project, or nowhere yet. Only the first and third are worth an interview turn.
<!-- hint -->
If the agent asks no questions at all, the interview instruction is competing with a stronger instinct to be helpful. Make it a precondition — "do not begin until I have answered" — rather than a suggestion.

### Level 2 (advanced)

Run the same request twice in two fresh sessions, both without any interview instruction, and compare the values each run invented. Then write the brief lines that would make both runs produce the same thing.

How: use a request with at least three genuine forks. Fresh session each time, identical text, no follow-up. Let both complete, then diff the two results — not the code, the decisions. Every place they differ is a blank the request left open and the models filled differently.

<!-- rubric -->
- Both runs started from identical text in sessions with no shared context.
- You list at least two decisions where the two runs differ, described as choices rather than as code differences.
- For each, you write the one brief line that would have forced the same answer in both.
- You note at least one decision where both runs chose the same thing, and judge whether it still needs stating.
<!-- answer -->
The diff between two unguided runs is the sharpest available map of a request's blanks, because it is empirical rather than imagined. Example, for "add a search box to the docs sidebar": run A did client-side filtering over page titles only, run B pulled in full-text search over body content and added a results-count line. The decisions that differ: search scope (titles versus full text) and whether a results count belongs in the UI. Brief lines: "Search titles only; full-text search over page bodies is out of scope" and "No results count — just the filtered list." Both runs also debounced input at 300ms without being asked, and that is a case where the shared default is fine and does not need a line: an agreed default costs you nothing, and briefs get ignored when they get long. A common mistake here is diffing the code and concluding the two runs differ everywhere — of course they do, since they wrote different code. Diff the decisions, which is a much shorter list.
<!-- hint -->
The decisions worth listing are ones you could describe to a non-programmer. If you cannot say it without naming a function, it is probably an implementation difference rather than a blank.
<!-- hint -->
If the two runs produce essentially the same decisions, your request was tighter than you thought. Try it with a request you'd call ambiguous, and note that "ambiguous to me" and "underspecified for an agent" are not the same set.
<!-- /exercises -->

## From questions to a finish line

You now know what an agent does with a blank, why it does not flag it, and how to get the questions asked in front of the work rather than discovered after it. That handles the decisions you and the agent can identify between you.

It does not handle the largest blank of all, and it is the one hiding in every example so far. In each of them, someone still had to decide when the work was finished. In the "recently viewed" exchange, the agent decided — it stopped when the section looked right to it. Lesson 3 is about writing that judgment down before the work starts, and about why an agent left to judge its own completion reliably decides it is done.
