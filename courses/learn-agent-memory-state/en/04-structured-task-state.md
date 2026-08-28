# Lesson 4: Structured State: How an Agent Remembers Where a Task Stands

> Learning goals:
> - Explain why burying task progress in conversational prose is unreliable, and why it has to become structured state
> - State the full lifecycle a todo goes through, from creation to removal
> - Distinguish the cost of starting over from scratch versus resuming from where the work was interrupted
> - Decide whether a piece of task state should live in the session history or be written into a separate checkpoint
>
> Prerequisites: Finish Lesson 3 and understand the two modes of external memory | Previous: [Lesson 3 <<](./03-external-memory-files.md) | Next: [Lesson 5 >>](./05-memory-boundaries-and-safety.md)

## After a Process Restart, Does the Agent Still Know Which Step It Reached

An agent is working through a multi-step task: refactoring a module, which breaks down into four steps — "update the type definitions," "update the call sites," "run the tests," "update the docs." It has just finished the second step when the process is interrupted by an unexpected restart. When it comes back up, it's facing the same task description. Should it redo step one from scratch, or does it know it already finished the first two steps and can pick up straight from step three?

The answer comes down to one thing: whether the task's progress was recorded as **structured state**, rather than scattered across a pile of conversational prose. If "the type definitions are already updated" is just a line of natural language in one of the model's earlier replies, buried among dozens of messages, the host code has no reliable way to pull the concrete fact "which step are we on" out of it. But if that progress is expressed as a **todo list** with fixed fields — where every task carries an explicit status marker — the host code can read it straight off: steps one and two are completed, step three hasn't started.

That's the core question this lesson tackles. Lessons 1, 2, and 3 were all about how to manage *content* — conversation history, memory files. This lesson is about how to express *progress*, so that an agent or its host application, after an interruption, knows exactly how far the task got.

## The Todo Lifecycle: Created, Activated, Completed, Removed

Take Claude Code's task-tracking tool as the example. The official docs lay out the full lifecycle a todo goes through during execution — four steps:[^S4]

1. **Created**: Claude adds the todo as pending when it identifies a task
2. **Activated**: Claude sets the todo to in_progress when it starts the work
3. **Completed**: Claude marks it completed when the task finishes successfully
4. **Removed**: Claude deletes a todo it no longer needs by setting status: "deleted" in a TaskUpdate call[^S4]

These four steps aren't the vague "I'm done" or "I'm working on it" of natural language. They're four explicit status values: pending, in_progress, completed, and deleted for removal. Every status change happens through an explicit tool call, not through the model tossing off a remark in its reply text.

The docs also spell out how this mechanism actually shows up in the conversation: "In a session that has the task-tracking tools, Claude keeps a written todo list, updating each item's status as it works. You see each change in the message stream as a structured tool call."[^S4] That sentence pins down the key distinction: progress isn't passively "reflected" in the conversation, it's actively written as a tool call that can be identified and parsed on its own. That's the real difference between structured state and a progress description scattered through prose.

```agentmentor-check
{
  "id": "mem-zh-04-structured-vs-prose",
  "label": "Judging how task progress should be expressed",
  "prompt": "An agent writes in a reply: \"I've finished updating the type definitions, and next I'll handle the call sites.\" Compared with a structured tool call that moves a todo's status from pending to in_progress and then to completed, what's the difference between the two when it comes to whether the host code can reliably read out the current progress?",
  "whyHere": "This check lands right after we've shown that the todo lifecycle is expressed through structured tool calls. It tests whether the learner assumes \"the model saying it equals the state being recorded,\" without realizing that a natural-language description and structured state differ fundamentally in whether a program can parse them reliably.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "No difference — both express the fact that the type definitions are updated, and the host code reads them the same way.",
      "correct": false,
      "feedback": "Not right. A natural-language description is a chunk of text the model produced; its format and wording can vary every time, and pulling a reliable \"which step, what status\" out of it is hard for the host code. A structured tool call has fixed fields (a task ID and a status value, say) that the host code can read directly, with no guessing and no natural-language understanding required."
    },

    {
      "id": "b",
      "text": "There's a difference — a structured tool call has fixed fields the host code can parse straight into a status, while a natural-language description needs extra interpretation to extract the same information, so it's far less reliable.",
      "correct": true,
      "feedback": "Correct. The value of structured state is that a program can read it directly — fields like the task ID and the status value are fixed, so the host code doesn't have to rely on language understanding to guess whether \"this sentence means the task is done.\" That's exactly why the docs stress that the task-tracking tool makes every status change appear in the message stream as a structured tool call, not just a text description."
    },
    {
      "id": "c",
      "text": "There's a difference, but it's only that a structured tool call looks more formal — the amount of information it actually conveys is the same.",
      "correct": false,
      "feedback": "The difference isn't just \"looks more formal.\" What matters is whether a program can parse it reliably — a natural-language description has no fixed format or wording, so the host code can't stably extract structured facts like \"which step, what status\"; a structured tool call has fixed fields. That's a substantive functional difference, not a question of style."
    }
  ]
}
```

## Checkpoints: Making Recovery Something Other Than Starting Over

Once you have a structured todo list, the next question is: where does the list itself live? If it exists only in this session's conversation history, then the moment the session truly ends (not a brief interruption but a full close, like the "once the session ends, everything in the window is gone" idea from Lesson 3), the progress record disappears with it. At bottom, the API is stateless: "The Messages API is stateless, which means that you always send the full conversational history to the API."[^S6]

That's the problem **checkpoints** solve: write the state of a task at some point in time — which steps are done, which step is current, which steps remain — into a piece of data, and persist it somewhere outside the session's lifetime. Checkpoints use the same underlying mechanism as the external memory from Lesson 3 (write a file, read it back later); the difference is that a checkpoint doesn't store "knowledge worth remembering," it stores "how far the task got" — the kind of state you can use directly to resume execution.

With checkpoints in place, **recoverability** finally holds: after a process restart, the agent doesn't have to guess "where was I." It reads the most recent checkpoint, sees "steps one and two are completed, step three is in_progress," and continues from step three instead of redoing steps one and two.

The cost comparison here is concrete. In the refactoring task, the "update the type definitions" step, if it's idempotent (running it again produces the same result), only costs wasted time when redone from scratch. But if some step is a non-idempotent operation like "insert a migration record into the database," starting over could insert two duplicate records and even corrupt data. What a checkpoint saves isn't just time — it's the risk of accidentally re-running that kind of non-idempotent operation.

```agentmentor-check
{
  "id": "mem-zh-04-checkpoint-durability",
  "label": "Judging where task state has to live to be dependable",
  "prompt": "An agent's todo-list state has always lived only in the current session's conversation history and was never written into a separate checkpoint file. If this session is fully closed (not a brief interruption but a real ending), the next time the same task starts, can the agent still read the progress \"the first two steps are already done\"?",
  "whyHere": "This check lands right after we've shown that a checkpoint has to write state outside the session's lifetime to actually support recovery. It tests whether the learner is conflating \"the todo list is structured\" with \"the todo list will necessarily survive after the session ends\" — being structured only solves \"can a program read it,\" not \"is it still there after the session ends.\"",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Yes, it can be read, because the todo list is already structured state, and structured data isn't lost when a session ends.",
      "correct": false,
      "feedback": "\"Structured\" and \"persistent\" are two different things. Structured solves \"can the host code reliably parse out the current state\"; it doesn't solve \"is this data still there after the session ends.\" Lesson 3 covered it — once a session ends, anything in the window that wasn't moved elsewhere is gone for good. If this todo list exists only in the conversation history and was never written into a checkpoint file, it disappears along with the session all the same."
    },
    {
      "id": "b",
      "text": "No, it can't be read, because this state exists only in this session's history and was never written into a checkpoint, so it disappears when the session ends.",
      "correct": true,
      "feedback": "Correct. Whether the todo list is structured only affects whether a program can parse it reliably; it doesn't affect whether it survives after the session ends. To make it readable after the session fully closes, you have to write it into a separate checkpoint file, just like the external memory from Lesson 3 — structured state that lives only in the conversation history can't escape the fate of vanishing when the session ends."
    },
    {
      "id": "c",
      "text": "Yes, it can be read, because the task-tracking tool automatically syncs every status change to disk.",
      "correct": false,
      "feedback": "That's a premise you can't just assume. The task-tracking tool's own job is to make status changes appear in the message stream as structured tool calls. Whether there's an extra layer syncing them to disk, or whether the developer has to implement that persistence themselves, depends on the specific design — you can't default to \"structured means automatically persisted.\""
    }
  ]
}
```

## Structured State Exists to Make Interruption Survivable

Back to the scenario that opened this lesson: after a process restart, should the agent start over or resume from where it was interrupted? Now we can answer it clearly — it depends on whether two things were done. Was the task's progress expressed as structured state (rather than scattered through conversational prose), and was that state written into a checkpoint (rather than living only in this one session's history)? You need both. With structured state but no checkpoint, the state still disappears when the session ends; with a checkpoint but no structured state, what got written into the checkpoint is itself vague natural language, and reading it back still won't tell you reliably which step the task reached.

This lesson was about how to express and preserve progress. The next lesson turns to another question that matters just as much: could this preserved state and memory become a target for attackers — what happens if an attacker can write content into a checkpoint or a memory file?

<!-- exercises -->
## 💻 Exercises

### Level 1: Label the lifecycle state of a single task run

An agent receives the task "add unit tests to the project" and breaks it into three todos: "write test cases," "run the test suite," "fix the failing cases." Following the chronological order below, write down which lifecycle state (pending / in_progress / completed / deleted) each todo should be in at each point in time.

1. The task has just been broken down; none of the three has started.
2. The agent starts writing test cases.
3. The test cases are written; the agent starts running the test suite.
4. Running the tests reveals two failing cases (case A and case B). The agent refines "fix the failing cases" into two new todos, "fix case A" and "fix case B," and starts fixing case A.
5. While fixing case A, it turns out case B was actually the test itself being written wrong and doesn't need changing at all, so "fix case B" is removed.

<!-- rubric -->
- Time 1: all three are pending
- Time 2: "write test cases" is in_progress, the rest stay pending
- Time 3: "write test cases" is completed, "run the test suite" is in_progress
- Time 4: "run the test suite" is completed, the original "fix the failing cases" is refined, "fix case A" is in_progress, "fix case B" is pending
- Time 5: "fix case B" changes to deleted, rather than simply vanishing from the list without a trace

<!-- answer -->
Reference answer: At time 1, all three todos are **pending** (created but not started). At time 2, "write test cases" becomes **in_progress**, while the other two stay pending. At time 3, "write test cases" becomes **completed** and "run the test suite" becomes in_progress. At time 4, "run the test suite" becomes **completed**; the original, catch-all "fix the failing cases" is refined into two new todos, "fix case A" and "fix case B," with "fix case A" at **in_progress** and "fix case B" at **pending**. At time 5, having found that case B doesn't need fixing, "fix case B" should have its status set to **deleted** through a TaskUpdate call — the fourth step of the lifecycle, "removed," is exactly what handles this "no longer needed" case, rather than letting the item silently vanish from the list with no record left.

<!-- hint -->
The four states map to the four steps of the lifecycle: created maps to pending, activated to in_progress, completed to completed, no longer needed to deleted. Work through each item against this lesson's "The Todo Lifecycle" section, one by one.

<!-- hint -->
Time 5 is where it's easy to miss the "becomes deleted" step and treat it as "this item no longer exists." Recall this lesson's point that every status change happens through an explicit tool call — removal likewise needs an explicit status change, not an implicit disappearance.

### Level 2: Diagnose an unrecoverable task design

A team designed this execution logic: the agent's task progress shows up only in the natural-language summary in each of its replies, something like "so far the first two steps are done, currently handling the third." That summary exists only in the current session's message history; the team writes no checkpoint files at all. The system occasionally restarts the process due to resource limits, and after a restart the same task is picked back up.

Point out the two problems in this design (one about "whether the state is structured," one about "whether the state is persisted"), and give the corresponding fix direction for each.

<!-- rubric -->
- Problem one: a natural-language summary isn't structured state, so the host code can't reliably parse out "exactly which step it reached"
- Problem two: progress exists only in the session history with no checkpoint written, so once a process restart loses the session, the state is lost with it
- The fixes correspond respectively to: switch to a todo list with fixed fields (like the pending/in_progress/completed/deleted set of statuses), and additionally write the list's state into a checkpoint file

<!-- answer -->
Reference answer: Problem one — progress exists only as a natural-language summary ("so far the first two steps are done"), with no fixed fields, so the host code has no way to reliably parse out "exactly which steps are done, which step is current." The wording of the summary can vary from turn to turn, so the parsing logic is easy to get wrong or can't be automated at all. The fix is to switch to a structured todo list where each todo has an explicit status field (pending / in_progress / completed / deleted), with status changes made through explicit tool calls rather than by re-interpreting natural language. Problem two — even after switching to a structured list, this state still lives only in the current session's message history, and the team writes no separate checkpoint file. Once a process restart ends the session, the history and the todo list inside it disappear together, and the next time it's picked back up there's again no way to know the progress. The fix is to additionally persist the todo-list state into a checkpoint file, so that after a process restart the agent first reads the most recent checkpoint, then decides which step to continue from, rather than relying on the session history alone.

<!-- hint -->
Think about the two problems separately: one is "can a program reliably read this progress description," the other is "even if it can, is the description still there after a process restart." This lesson calls these two things structured state and checkpoints — they solve problems at different levels.

<!-- hint -->
Recall Lesson 3's "once the session ends, everything in the window is gone" — if the todo list lives only in the session history, then no matter how structured it is, once a process restart ends the session it disappears along with it. That's exactly why checkpoints exist.

<!-- /exercises -->

## Recap

- Task progress can only be read reliably by the host code once it becomes structured state; a progress description scattered through natural-language replies can't be parsed stably into "which step we're on right now"
- The full lifecycle of a todo is four steps — created (pending), activated (in_progress), completed (completed), removed (deleted) — and each step happens through an explicit structured tool call that can be observed in the message stream
- Structured and persistent are two different things: structured solves "can a program read it," a checkpoint solves "is the state still there after a process restart or a session ends" — you need both
- A checkpoint writes a task's state at a point in time to somewhere outside the session's lifetime, turning recovery into "continue from where it was interrupted" rather than "start over," and especially avoiding the accidental re-run of non-idempotent operations
- Structured state, like external memory, becomes its own attack target once persisted — the topic of the next lesson; the more you preserve, the more boundaries you have to hold

[>> Lesson 5: The Boundaries and Safety of Memory](./05-memory-boundaries-and-safety.md)
