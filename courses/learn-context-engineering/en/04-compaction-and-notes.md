# Lesson 4: Compaction and Notes: Context Management for Long Tasks

> Learning goals:
> - State what compaction is and how it's implemented: when a conversation nears the window's limit, hand the message history to the model to summarize, then reinitiate a fresh window from that summary
> - Write the summarize instruction and the keep/drop list for one compaction, following the rule: preserve architectural decisions and unresolved bugs, discard redundant tool output
> - Tell the roles of compaction and structured notes apart, and design a write-as-you-go note scheme for a long-task agent
>
> Prerequisites: You've finished Lessons 1 through 3 of this course, and you can hand-write the harness loop from course 7 of this series, "Agent Harness Fundamentals: Loops and Control" | Prev: [Lesson 3 <<](./03-just-in-time-context.md) | Next: [Lesson 5 >>](./05-subagent-context-isolation.md)

## A Task One Window Can't Hold

Start with a scene you'll hit soon enough. You take the harness you hand-wrote in course 7 of this series, "Agent Harness Fundamentals: Loops and Control," and point it at a debugging task: fixing a race condition that only shows up under concurrency. The agent reads files, runs tests, edits code, runs the tests again — forty-some turns in, the task still isn't done, but the message history has swollen past a hundred thousand tokens and the window is about to fill.

The four control valves from course 7 (max turns, budget, idle-spin detection, the approval valve) are no help here. They govern "don't let the loop run away," but the loop is behaving fine — the task itself is just long. That's not a mishap; it's the loop's nature: "An agent running in a loop generates more and more data that could be relevant for the next turn of inference"[^S1] — tool output, intermediate conclusions, failed attempts, all piling into the message history.

And the window isn't free. A model parsing large volumes of context draws on an "attention budget," and "Every new token introduced depletes this budget by some amount."[^S1] The more tokens pile up, the worse the model gets at accurate recall: "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases"[^S1] — a gentle downhill slope rather than a cliff, but downhill all the same, so "context, therefore, must be treated as a finite resource with diminishing marginal returns."[^S1] The Claude Code best-practices doc puts it more bluntly — "Claude's context window fills up fast, and performance degrades as it fills," and "The context window is the most important resource to manage."[^S4]

When a task runs too long for one window to hold, you have two weapons: compaction and structured notes. This lesson works both through.

## Compaction: Summarize, Then Open a New Window

Compaction is exactly what the name says: "taking a conversation nearing the context window limit, summarizing its contents, and reinitiating a new context window."[^S1] Notice the last part — you don't stuff the summary back into the old conversation and keep cramming; you reinitiate. The old window is abandoned whole, and the new one travels light, carrying only the system prompt and the summary.

The implementation is plainer than it sounds: it's "passing the message history to the model to summarize and compress the most critical details."[^S1] Which means compaction is itself one extra model call. In code it looks roughly like this (`formatHistory` just joins the message array into readable plain text; implementation omitted):

```javascript
const COMPACT_INSTRUCTION = `Below is an agent's complete work log so far. Compress it
into a handoff summary for a brand-new session to continue this task from. The summary
must keep:
1. The architectural decisions already made, and the reasoning behind them
2. The problems still unsolved (bugs, errors, sticking points), and how far the
   investigation has gotten
3. Key implementation details of the changes already made (which files and functions
   changed, and why)
The following can be dropped, or reduced to a one-line conclusion:
- Redundant tool output (raw returns from reading the same file over and over, or
  rerunning the same tests)
- The full play-by-play of intermediate attempts that were later discarded
`;

async function compact(client, messages) {
  const resp = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: COMPACT_INSTRUCTION + "\n\n" + formatHistory(messages),
    }],
  });
  const summary = resp.content[0].text;
  // Reinitiate: the new window's history is just this summary (the harness keeps the system prompt as-is)
  return [{
    role: "user",
    content: "Here is a handoff summary of prior work; continue from here:\n\n" + summary,
  }];
}
```

Splicing it into that course 7 loop takes just one more idea: at the start of each turn, check the message history's token usage, and once it nears the limit, call `compact()` and replace the entire `messages` array with the return value. Actually building this into the harness — how to set the trigger threshold, what to do when compaction fails — is the hands-on material of Lesson 6; for now, just get the mechanism straight.

## The Art of Compaction: What to Keep, What to Drop

The hard part of compaction isn't "how to summarize" — it's "what to keep, what to drop." The direction is actually clear: "preserves architectural decisions, unresolved bugs, and implementation details while discarding redundant tool outputs."[^S1]

Why that trade-off? Imagine the agent "waking up" in the new window; that summary is its entire memory. The cost of compressing in the wrong direction is concrete: say your summarize instruction just says "briefly summarize the conversation content," and the model casually drops "there's an unfinished race condition in `orders/service.js`" — the agent wakes up seeing only records marked "complete," so it either declares the job done or picks through things you already fixed. One compaction, forty turns of work just went off the rails.

Flip it around: redundant tool output is the fattest target. One grep returns 200 matching lines; the useful signal is already captured in the next step's conclusion, "narrowed to the `updateStatus` function." The raw 200 lines sticking around just burn attention budget, adding nearly no decision value to the next move.[^S1]

A practical self-check: after you write the summarize instruction, take a real long conversation and compact it once, then answer three questions from the summary alone — "what should happen next," "what decisions are locked in," "what holes are still unfilled." If all three come out clean, your instruction's keep/drop rules pass; if any blank out, go back and patch that keep rule.

```agentmentor-check
{
  "id": "ctx-zh-04-compaction-tradeoff",
  "label": "Judge which information must be preserved when compacting a long conversation",
  "prompt": "A debugging agent has run for 50 turns, and the context window is nearing its limit. The harness is about to trigger compaction. You're writing the summarize instruction — which class of information must you explicitly require it to keep?",
  "whyHere": "The previous section just laid out the keep/drop principle: preserve architectural decisions and unresolved bugs, discard redundant tool output. This checks whether the reader can apply that rule to a concrete scenario, rather than treating compaction as an undifferentiated 'keep everything' or 'delete everything.'",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Preserve the verbatim original of all 50 turns of tool output, ensuring zero information loss",
      "correct": false,
      "feedback": "The whole point of compaction is to free window space; keeping the full original means no compaction. Redundant tool output (like raw returns from reading the same file over and over) is exactly what the keep/drop principle says to discard — it burns attention budget, and any useful conclusion has already settled into later decision records."
    },
    {
      "id": "b",
      "text": "No need to sort by class — just keep the verbatim original of the last 10 turns and physically delete everything earlier; it's faster and saves one summarize call",
      "correct": false,
      "feedback": "That's truncation, not compaction. A time-based chop physically removes the architectural decisions made early on and the problem records not yet solved — they may not appear in the last 10 turns. Compaction's definition is 'summarize then reinitiate': let the model judge what stays, allowing key information to survive in summary form, not throw it out by position."
    },
    {
      "id": "c",
      "text": "Bugs not yet fixed and architectural decisions already made",
      "correct": true,
      "feedback": "Compaction is lossy; the key is letting the loss land on redundancy, not on what matters. Unsolved problems and locked decisions are the minimum grounding the agent needs to continue working in the new window: lose the former and it'll think the task is done; lose the latter and it'll re-debate settled choices from scratch."
    }
  ]
}
```

## Compaction in Production: Auto-Compaction and /clear

The tool you use every day has a ready-made reference. Claude Code "automatically compacts conversation history when you approach context limits, which preserves important code and decisions while freeing space"[^S4] — the same mechanism as the hand-written `compact()` above, just productized with the triggering and keep/drop rules done for you.

But compaction isn't the only option. If you're switching to an **unrelated** new task, the old context is not just useless — it's harmful, because "Long sessions with irrelevant context can reduce performance."[^S4] At that point the docs say "Run /clear between unrelated tasks to reset the context window entirely"[^S4] — no summarizing, no preserving, just a full reset. The reasoning is simple: compaction costs one model call and carries the risk of getting the keep/drop judgment wrong; for an unrelated task, clearing outright is cheaper and cleaner. Compaction serves "the same task isn't done yet," while `/clear` serves "now I'm doing something else."

That doc also has a line worth keeping at hand: "A clean session with a better prompt almost always outperforms a long session with accumulated corrections."[^S4] Translation: when a session's history is mainly "no, try again" and "still wrong," the historical value for the next step is likely negative — reopening a session and baking the lesson directly into a new prompt often beats dragging all that baggage forward.

## Structured Notes: Write Key State Outside the Window

Compaction has one built-in weakness: it's reactive. You wait until the window is nearly full before you look back and summarize, so what survives depends entirely on that moment's judgment — and judgment can fail. Is there a way to preserve information while it's fresh?

Yes, and it's plain: "the agent regularly writes notes persisted to memory outside of the context window."[^S1] "Like Claude Code creating a to-do list, or your custom agent maintaining a NOTES.md file."[^S1] Take that opening race-condition task again; a passing-grade set of notes looks roughly like this:

```markdown
# NOTES.md — Fix order service race condition

## Decisions Made
- Test framework: switched to vitest (decided turn 3, reason: existing test fixtures depend on it)

## Unsolved
- orders/service.js updateStatus has a race condition:
  two concurrent requests modifying the same order, last write clobbers first
- Already tried: in-process mutex -> works single instance, fails in multi-instance deploy

## Next Step
- Try database-level optimistic locking (add version field to orders)
```

Wiring is something you learned in course 7: give the agent a file-writing tool, then add one requirement to the system prompt — "whenever you make an important decision, discover a new problem, or finish a stage, update `NOTES.md` first, then continue." From now on, the window's key state has a backup copy outside the window. No matter how the window compacts or restarts, the notes sit on disk; the first thing the new window does is read them back.

This trick isn't specific to coding tasks. "Claude playing Pokémon demonstrates how memory transforms agent capabilities in non-coding domains."[^S1] Anthropic's multi-agent research system does the same for long tasks: "agents summarize completed work phases and store essential information in external memory."[^S3]

## Division of Labor: Compaction Backstops, Notes Run Daily

Put both weapons side by side and the division of labor becomes clear. Compaction is passive: it fires when the window nears its limit, timing not your choice, and it's lossy — what survives depends on that moment's keep/drop judgment. Notes are active: you write key state the moment it's born, content is lossless, and the cost is just a few lines of file writes each time. One sentence: notes are daily routine, compaction is the backstop.

The two don't clash; they reinforce. The more diligent your notes, the lighter the consequence of compaction dropping something — if the summary misses a detail, the notes still have it. Going the other way, having compaction as the backstop means notes don't have to be exhaustive, just the few categories "the agent must know when waking up."

Proportion matters too. Not every task earns this machinery: Anthropic's guidance is "you should consider adding complexity only when it demonstrably improves outcomes."[^S2] Note the verb — *consider*. That's a posture of weighing, not a prohibition. For a task that finishes in ten turns, both compaction and notes are spare parts; start with the simplest loop and add them when you actually hit the ceiling.

Two final boundaries, so you don't waste time hunting for answers this lesson doesn't cover:

- **Cross-session** persistence of note files — how to organize them, how to recover them in a new session, long-term maintenance — is the subject of course 5 of this series, "Agent Memory and State." This lesson only cares about how notes lighten the window's load within one long task.
- Handling long-horizon tasks actually has three moves: "compaction, structured note-taking, and multi-agent architectures,"[^S1] all aimed at letting agents "maintain coherence, context, and goal-directed behavior over sequences of actions."[^S1] The first two are done; the third — splitting the task across subagents carrying clean windows — is Lesson 5.

<!-- exercises -->
## 💻 Exercises

### Level 1: Write the Summarize Instruction for One Compaction

Your debugging agent has run for forty-some turns, and the message history mixes several categories: an early choice to switch to vitest, a race bug discovered midway but not yet fixed, dozens of repeated file-read tool outputs, plus key implementation details of the two functions you fixed at the end. The window is nearly full; the harness is about to trigger compaction. Write the summarize instruction you'd hand to the model (English is fine), and separately list the corresponding "keep list" and "drop list" outside the instruction itself.

<!-- rubric -->
- The summarize instruction explicitly requires keeping: the unsolved race bug and investigation progress, the architectural decision (switch to vitest) and its reasoning, the key implementation details of the functions already changed
- The summarize instruction explicitly requires dropping or reducing to a one-line conclusion: redundant file-read outputs and other repeated tool returns
- The instruction explains that the summary's purpose is to reinitiate a new window (as the opening context for a new conversation), not to append back into the old conversation

<!-- answer -->
A passing summarize instruction:

"Below is a debugging agent's complete work log. Compress it into a handoff summary for a brand-new session to continue this task from. The summary must keep: first, the architectural decisions made and their reasoning (e.g., test framework choice); second, the bugs not yet solved and the current investigation leads; third, the key implementation details of changes already made (which functions changed, why you changed them that way). Drop or reduce to a one-line conclusion: redundant file-read raw returns, the full play-by-play of intermediate attempts that were later discarded."

Keep list: the unfixed race bug and the location where investigation stopped; the "switch to vitest" decision and its reasoning; the names, change contents, and motivation of the two changed functions.  
Drop list: dozens of repeated file-read outputs (the useful conclusion is already reflected in the decisions); the full back-and-forth of abandoned attempts.

Usage note: this summary doesn't get stuffed back into the old conversation; it's used to reinitiate a new window — the new window carries only the system prompt plus this summary, and the agent continues from the summary.[^S1]

<!-- hint -->
Ask yourself first: "What's the minimum the agent must know when waking up in the new window to keep working?" Reverse-engineer the answer into the keep list.

<!-- hint -->
Redundant isn't the same as useless — those tool outputs were useful at the time, but if their conclusion has already settled into later decision records, the originals can go.

### Level 2: Diagnose "Amnesia After Compaction"

Someone wrote this "compaction" function for the harness, calling it when the window is nearly full:

```javascript
function compact(messages, keepLast = 10) {
  // Window nearly full: keep the first message and the last 10, drop the rest
  return [messages[0], ...messages.slice(-keepLast)];
}
```

After hooking it in, the agent triggered compaction at turn 45. You then observed two symptoms: first, at turn 47 it restarted debate over "should the test framework be node:test or vitest," a question already decided at turn 3 as vitest; second, it never mentioned the unresolved race bug recorded at turn 5, and declared the task done a few turns later. Explain the cause of both symptoms, and give a two-layer fix.

<!-- rubric -->
- Points out this `compact()` is pure truncation, not summarization: keeps only the first message and the last 10, physically deleting the turn-3 decision and the turn-5 bug record. After compaction these pieces of information no longer exist in context, so the agent re-debates settled decisions and has no way to recall unfinished bugs
- First-layer fix: replace truncation with model summarization — hand the message history to the model for compression, instruction explicitly preserving architectural decisions, unresolved bugs, and key implementation details while dropping redundant tool output, then reinitiate a new window from the summary
- Second-layer fix: add structured notes — give the agent a file-writing tool, require it to update a `NOTES.md` outside the window when making decisions or discovering problems, read the notes after compaction or restart to recover state, so key state no longer depends on the compaction moment's judgment

<!-- answer -->
Cause: this `compact()` doesn't "summarize" at all — it's truncation. It keeps the first message (usually the task description) and the last 10, throwing away the middle thirty-some turns as a solid block — the turn-3 message locking in vitest and the turn-5 message recording the race bug both land in the discarded zone. The information was physically deleted, not compressed, so in the agent's next inference these messages are as if they never happened: no decision record, it naturally re-debates test framework choice; no bug record, it sees no evidence "there's unfinished work," so declaring done a few turns later is perfectly reasonable.

Fix in two layers. First layer, replace truncation with real compaction: hand the about-to-be-discarded message history to the model for summarization, instruction explicitly requiring it to keep architectural decisions already made, bugs not yet solved, and key implementation details, drop repeated tool output, then reinitiate a new window from that summary.[^S1] This way turn-3 and turn-5 information survives in summary form. Second layer, add structured notes as insurance: give the agent a file-writing tool, require it to update a `NOTES.md` outside the window when locking decisions or discovering problems;[^S1] read the notes first after compaction or restart. This way even if one summarization's judgment fails, key state still has a lossless backup copy on disk.

<!-- hint -->
Contrast "truncation" and "summarization": truncation drops whole messages, summarization drops detail but keeps conclusions. Ask yourself — after this compaction, are those two messages from turn 3 and turn 5 still in context?

<!-- hint -->
If key state had already been written outside the window before being discarded, would compaction dropping something still be fatal? Think from here toward the second-layer fix.

<!-- /exercises -->

## Recap

- Compaction = when a conversation nears the window limit, "passing the message history to the model to summarize and compress the most critical details,"[^S1] then "reinitiating a new context window"[^S1] from that summary — reinitiate, not append back into the old conversation
- The art of compaction is in the keep/drop choice: "preserves architectural decisions, unresolved bugs, and implementation details while discarding redundant tool outputs";[^S1] compress in the wrong direction and the agent wakes up forgetting what it was doing
- Claude Code "automatically compacts conversation history when you approach context limits, which preserves important code and decisions"[^S4]; between unrelated tasks use `/clear` for a full reset — "A clean session with a better prompt almost always outperforms a long session with accumulated corrections"[^S4]
- Structured notes: "the agent regularly writes notes persisted to memory outside of the context window" (to-do list, `NOTES.md`);[^S1] compaction is passive backstop and lossy, notes are active externalization and write-as-you-go
- The three moves for long-horizon tasks are "compaction, structured note-taking, and multi-agent architectures";[^S1] the first two are in hand, the third is Lesson 5. Cross-session note persistence is the subject of course 5 of this series, "Agent Memory and State"

[>> Lesson 5: Subagents and Context Isolation](./05-subagent-context-isolation.md)
