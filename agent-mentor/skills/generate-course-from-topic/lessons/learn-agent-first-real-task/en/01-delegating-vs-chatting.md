# Lesson 1: Asking Versus Handing Over

> Lesson objectives:
> - Describe what changes mechanically when an agent acts instead of answering.
> - Explain why a mistake inside a run costs more than a mistake in a chat turn.
> - Apply a four-question delegation test to one of your own real tasks.
>
> Prerequisites: you can use an AI chat tool and open a folder on your own computer | Previous [<< Course contents](./README.md) | Next [02 >>](./02-bounding-the-task.md)

## The moment you stop being asked

You have probably had this experience. You ask a chat assistant to help you rename a folder full of photos. It writes you a neat set of instructions. You do the renaming yourself. The assistant was useful, but you did the work, and at every step you could see what was about to happen before it happened.

Now picture the same request going to an agent that can reach your files. You describe the task once. Then nothing is shown to you for two minutes. Then it reports: "Renamed 143 photos." You did not see file number 37 get renamed. You did not approve it. It already happened.

That gap — between being handed instructions and being handed a result — is what this whole course is about. This lesson is about deciding which of your tasks belong on the far side of it. You will not run anything yet. By the end you will have one candidate task written down.

## Explanation

### What an agent actually does that a chat does not

Start with the plain version. In a chat, the assistant reads your message and writes text back. Whatever happens next in the real world happens because you did it.

An agent adds one capability: it can take an action, look at what came back, and decide what to do next based on what it saw. Anthropic describes this shape directly — agents are "typically just LLMs using tools based on environmental feedback in a loop," and they "dynamically direct their own processes and tool usage, maintaining control over how they accomplish tasks."[^S1]

Three words in that description carry the weight:

- A **tool call** is a single action the agent takes on something outside the conversation — reading a file, writing a file, running a command, fetching a page.
- **Environmental feedback** is what comes back from that action: the file's contents, an error message, a list of results. It is information the agent did not have when you gave it the task.
- The **loop** is the part that makes it an agent rather than a script: it calls a tool, reads the feedback, and chooses the next call itself.

An **agent run** is one span of that loop, from the task you hand over to the moment it stops. A **chat turn** is one message-and-reply exchange with no loop in it. That is the whole structural difference, and everything else in this course follows from it.

Anthropic draws a further line worth knowing. A system where the steps are fixed in advance and the model just fills in the blanks is a *workflow*; agents are the case where the model decides the steps.[^S1] When you delegate, you are choosing the second one — you are buying the ability to not specify every step, which is exactly why you cannot predict every step either.

### The trade you are making

**Delegation** here means handing over a task along with the authority to take the intermediate steps unsupervised. You get back time and attention: you stop being the one who executes step 37.

What you give up is visibility mid-task. And there is a second cost that is easy to miss. Agents are **stateful** — each action changes the situation the next action starts from. Anthropic's engineering team states the consequence in one line: "Agents are stateful and errors compound."[^S8] They spell out the mechanism too: "One step failing can cause agents to explore entirely different trajectories, leading to unpredictable outcomes."[^S8]

This is the real asymmetry between the two modes, and it is worth being precise about:

| | Chat turn | Agent run |
|---|---|---|
| What a mistake costs | A bad answer you can ignore | A changed file, and every later step built on it |
| When you notice | Immediately, reading the reply | Afterwards, if you check |
| What you review | The output | The **action trail** — the sequence of actions actually taken |

A **compounding error** is a mistake whose cost grows because later work is built on top of it. In a chat, a wrong answer is a wrong answer; you read it and move on. In a run, a wrong step at minute one can be the foundation for eight minutes of confident, internally consistent work built on a false premise.

### Reversible and irreversible actions

Because you are not watching, the question "what is the worst this action could do" moves from something you judge in the moment to something you have to think about in advance.

A **reversible action** is one you could undo in a minute if it turned out wrong: creating a file, writing a draft, reading something. An **irreversible action** is one where undoing it is expensive or impossible: deleting things, sending a message to another person, overwriting an original you have no copy of, changing something other people depend on.

This is not hypothetical. Anthropic keeps a log of these events and describes it plainly: "We keep an internal incident log focused on agentic misbehaviors. Past examples include deleting remote git branches from a misinterpreted instruction, uploading an engineer's GitHub auth token to an internal compute cluster, and attempting migrations against a production database. Each of these was the result of the model being overeager, taking initiative in a way the user didn't intend."[^S4]

Read what those three incidents have in common. None of them is the agent being stupid. Each is the agent doing something *plausibly connected* to the task it was given, at a scale the person did not intend. That failure shape — reasonable action, unintended reach — is the one you are learning to bound.

### The delegation test

So which tasks are worth handing over? Four questions, and you want a real answer to each before you delegate:

1. **Is there more than one step?** One step is a chat turn. Delegation only pays when there is a sequence to be run.
2. **Can you tell afterwards whether it worked?** If you cannot check the result, you cannot supervise the run at all — you can only believe it.
3. **What is the worst irreversible action in reach?** If the honest answer is "it could destroy something I cannot get back," that is a task to bound hard or do yourself.
4. **Would you be able to tell a good result from a plausible one?** If you could not spot a convincing-looking wrong answer, delegation hands you a result you have no way to judge.

Question 4 is the one people skip. It is also the one that decides whether your first task teaches you anything, because a task you cannot grade cannot correct you.

```agentmentor-check
{
  "id": "agent-first-real-task-delegation-fit",
  "label": "Pick the safer first delegation",
  "prompt": "You want to try your first real agent run. Two candidates: (A) go through a folder of 200 downloaded receipts, pull out the date and amount from each, and write them into one summary file; (B) go through your email archive, find messages that look obsolete, and delete them. Both are multi-step. Which is the better first task, and because of what?",
  "whyHere": "Readers new to delegation tend to pick by how boring the task is rather than by what an unsupervised mistake would cost, which is the judgment this lesson is building.",
  "copyPurpose": "Have the agent check whether I am choosing first tasks by tedium rather than by what a wrong step would destroy.",
  "mode": "single",
  "choices": [
    {
      "id": "receipts",
      "text": "A, because the work is additive — it reads originals and writes one new file, so a wrong step leaves a wrong line you can compare against a receipt still sitting there",
      "correct": true,
      "feedback": "The originals survive every step, so mistakes stay inspectable and undoable, and you can grade the output line by line against source documents that never changed."
    },
    {
      "id": "email",
      "text": "B, because deleting obsolete mail is routine and the judgment on each message is simple",
      "correct": false,
      "feedback": "Per-message judgment being easy is not the risk; deletion is irreversible, so a misread of 'obsolete' destroys the very evidence you would need to notice the misread."
    },
    {
      "id": "either",
      "text": "Either one works, since both are multi-step and both have a clear description",
      "correct": false,
      "feedback": "Multi-step and clearly described only satisfies the first delegation question; the two tasks differ sharply on the third, because one writes a new file and the other removes originals."
    }
  ]
}
```

## Worked example: putting one real task through the test

Here is the task, as it would actually occur to you:

```text
My screenshots folder is a mess. There are about 300 files with names like
"Screenshot 2026-03-14 at 09.41.22.png". I want them sorted into folders by month.
```

Run the four questions:

```text
1. More than one step?
   Yes — read the file list, parse a date out of each name, create month folders, move each file.

2. Can I check the result afterwards?
   Yes. I can open the folder and count: does every file sit under a month matching its name?

3. Worst irreversible action in reach?
   Moving is mostly recoverable. But if two files share a name and one overwrites the other,
   that is unrecoverable. Also: a file whose name has no parseable date might get moved somewhere
   arbitrary, or deleted as "unmatched."

4. Could I tell a good result from a plausible one?
   Yes, but only by spot-checking. "All 300 sorted" would look identical to "280 sorted and
   20 quietly skipped" unless I count.
```

Question 3 turned up a real hazard, and question 4 turned up the precise lie the result could tell. Both are things you would not have thought about while typing the request. Note what they change:

```text
Verdict: good first task, with two conditions —
  - copy the files rather than move them, so the originals survive
  - the agent must report a count of files it could not sort, not just a success message
```

That is what putting a task through the test produces: not a yes or no, but a yes plus the specific conditions that make it safe to grade.

## Your turn: run the test on a task with a sharper edge

Same four questions, a task with more hazard in it. Fill in the four answers, then write the verdict line.

```text
Task: "Go through my project notes folder and merge the three files that cover
the same meeting into one clean summary, so I stop having duplicates."

1. More than one step? ______________________________________________
2. Can I check the result afterwards? ________________________________
3. Worst irreversible action in reach? _______________________________
4. Could I tell a good result from a plausible one? __________________

Verdict: _____________________________________________________________
```

Reference answer:

```text
1. Yes — find candidate files, read all three, decide what is duplicated, write a merged file.
2. Partly. I can read the summary, but checking that nothing was *dropped* means rereading
   all three originals, which is most of the work I was trying to delegate.
3. "So I stop having duplicates" reads as permission to delete the three originals. If the
   merge lost a detail, the evidence is gone with them.
4. This is the weak point. A merged summary always reads clean. Content that was silently
   dropped leaves no trace in the output — absence is invisible.

Verdict: delegate the merge, but not the cleanup. The agent writes the merged file and leaves
all three originals untouched; deleting them is my decision after I have compared.
```

The lesson inside that answer: the phrase "so I stop having duplicates" was doing damage. It sounds like context. It reads as authorization. You will meet that pattern again in Lesson 2.

<!-- exercises -->
## 💻 Exercises (point these at your own real environment)

### Level 1 (warm-up)

Pick one real task from your own computer or work that you have been doing by hand, and run it through the four-question delegation test in writing. Do not start an agent run — this is a paper exercise in a scratch file or notebook.

How: choose something you have actually done at least twice, write the task in one sentence as you would say it out loud, then answer all four questions. For question 3, name a specific file or thing that could be destroyed, not a category.

<!-- rubric -->
- The task is described in one sentence, in your own words, and names a real folder or real material.
- All four questions are answered, and question 3 names something specific that could be lost.
- The verdict line states either a condition that makes the task safe or a reason to keep doing it by hand.
<!-- answer -->
A passing answer is specific enough to act on. For example: "Task: collect the invoice totals from the 40 PDFs in ~/receipts into one spreadsheet. 1. Yes, four steps. 2. Yes, I can re-add the column and compare to my bank statement. 3. Nothing gets deleted, but if it writes into my existing budget file it could overwrite this quarter's manual entries. 4. Only partly — a wrong total looks exactly like a right one, so I would have to re-check a sample. Verdict: delegate, but it writes to a new file, and I spot-check five rows against the PDFs." A weak answer stays abstract: "Yes, it is multi-step. It could mess up my files. I would probably notice." Nothing there tells you what to do differently.
<!-- hint -->
For question 3, open the folder you named and ask what is in there that exists in only one copy.
<!-- hint -->
For question 4, imagine the agent finishes and reports success but got 10% of it wrong. What would you have to do to catch that? If the answer is "redo the task," that is what question 4 is warning you about.

### Level 2 (advanced)

Take a task you would *not* delegate, and find the smallest piece of it you would. Write both: the full task with the specific reason it fails the test, and the carved-out piece that passes.

How: pick something with real consequences — messages to other people, financial records, anything with one irreversible step in the middle. Identify which of the four questions it fails. Then split it so the agent does the part that only reads and drafts, and you keep the part that commits.

<!-- rubric -->
- You name which specific question the full task fails, and why.
- The carved-out piece passes all four questions, and you say how you would check it.
- The boundary between the two parts falls on a real irreversible action, not an arbitrary halfway point.
<!-- answer -->
Example: "Full task: go through the 60 unanswered customer emails and reply to the routine ones. Fails question 3 — sending is irreversible and it reaches other people; a wrong reply cannot be recalled. Carved-out piece: read all 60, group them by question type, and draft a reply for each into a single file without sending anything. Passes all four: multi-step, checkable by reading the drafts, nothing irreversible in reach because sending is not among the actions, and I can judge a draft because I know what these customers ask." The boundary is the send action, which is where reversibility actually changes. Splitting at "do the first 30" instead would be arbitrary — it halves the volume without removing the hazard.
<!-- hint -->
The split usually falls at the moment something leaves your control: sent, published, deleted, overwritten.
<!-- hint -->
If the carved-out piece still fails question 4, the task may not be one you can supervise yet — that is a real finding, not a failure of the exercise.
<!-- /exercises -->

## What you now have on paper

You have one candidate task, four honest answers about it, and — if the test did its job — a condition or two that were not in your head when you started. That is the raw material for the next step.

What you do not have yet is a boundary the agent can actually read. "Copy rather than move" and "report what you skipped" are conditions in your notes, not instructions in the task. Lesson 2 turns them into three things you can hand over: where the work stops, where it may reach, and what it must ask you about first.
