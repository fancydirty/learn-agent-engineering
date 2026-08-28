# Lesson 2: Managing Conversation History: Append, Truncate, Summarize

> Learning goals:
> - Explain why conversation history only grows and never shrinks by default
> - Say what truncation throws away, what it keeps, and what structure it can break
> - Tell apart the problems that compaction and tool-result clearing each solve
> - Judge which mechanism to reach for based on window usage and the kind of content that's bloating it
>
> Prerequisites: finish Lesson 1 and understand what a context window is made of | Prev: [Lesson 1 <<](./01-context-window-is-memory.md) | Next: [Lesson 3 >>](./03-external-memory-files.md)

## Append is the default: why history keeps growing

Lesson 1 made the point that the history the model sees is whatever the host app re-sends every turn. So how does it actually get sent? The plainest implementation is **append**: when a turn ends, you tack the new messages from that turn (the user's words, the model's reply, tool calls and their results) onto the end of the existing `messages` array, and next turn you send the whole array back out as-is.

The official docs put this default plainly: as the conversation moves forward, each user message and model reply piles up in the context window, and every earlier turn is kept in full. "As the conversation advances through turns, each user message and assistant response accumulates within the context window, and previous turns are preserved completely."[^S1] Nobody is actively deleting anything, so history only climbs — ten turns in, the window holds all ten turns' worth of content, not a summary of the latest turn and not an auto-filtered set of highlights.

In a short conversation this is a non-issue. But for an Agent that runs a long time, the problem snowballs: every tool call's full arguments and full return value get stuffed into history, and a task that repeatedly reads files and runs commands can easily push the `messages` array into the tens of thousands of tokens after a few dozen turns. Lesson 1 covered that the window has a hard capacity ceiling, and the fuller it gets the closer you are to hitting it. The subtler cost is **context rot** — the longer and messier the history, the harder it is for the model to find the one line in there that actually matters right now[^S1]. Let history grow unchecked and you eventually pay both bills.

## Truncation: the simplest and bluntest option

The most direct response is **truncation**: when the window is nearly full, cut the oldest batch of messages outright and keep only the most recent N turns. This is the easiest thing to build — no extra model call, no summary format to design. A single line of `messages.slice(-N)` does it.

But what truncation drops is gone for good. If the batch you cut contained a key constraint the user stated back in turn 3 ("budget stays under \$5,000") and the Agent is now at turn 40 about to place an order, that information simply vanishes. The model won't know it once "saw" and then "forgot" it — it just behaves as though it was never told.

Truncation has a more hidden trap too, one that ties directly back to the round-trip protocol from the previous course, Agent Tool Calling: Getting Agents to Actually Do Things, Lesson 2 "The Full Round-Trip of a Tool Call": if you truncate by naively slicing to "the last N messages," you can easily cut in the middle of a `tool_use` / `tool_result` pair — keeping the `assistant` message that fired the call but slicing off the `tool_result` message that came right after it. Send that history to the model and the protocol itself is broken. The docs are explicit that "Tool result blocks must immediately follow their corresponding tool use blocks in the message history."[^S7] An error like "tool_use ids were found without tool_result blocks immediately after" is the signal that the pairing is broken[^S7] — the model sees that it "started a call" but never gets that call's result, and the next request fails outright.

```agentmentor-check
{
  "id": "mem-zh-02-truncation-tradeoff",
  "label": "Work out what truncation threw away",
  "prompt": "An Agent has run 40 turns, the window is nearly full, and you wrote one line — messages.slice(-10) — to keep only the last 10 messages before sending them to the model. The user said 'budget stays under $5,000' back in turn 3. Will that constraint still show up in the model's behavior?",
  "whyHere": "We just covered that truncation drops the information inside the batch it cuts. This checks whether the learner thinks 'the model has a good memory, it'll always keep the important stuff' instead of understanding that 'content that wasn't sent is content the model never saw.'",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "It still shows up — the line matters enough that the model committed it to memory in an earlier turn.",
      "correct": false,
      "feedback": "No. Lesson 1 covered this: the model stores nothing across requests, so how important a line is makes no difference. Once truncation cuts turn 3's message, it no longer appears in the messages array you send, and to the model that line reads as if it was never said."
    },
    {
      "id": "b",
      "text": "It won't show up — turn 3's message was already dropped by truncation and isn't in this request.",
      "correct": true,
      "feedback": "Right. Keeping only the last 10 messages leaves turn 3's 'budget stays under $5,000' out of this request's messages array. Whatever isn't in the window doesn't exist as far as the model is concerned, no matter how important it originally was."
    },
    {
      "id": "c",
      "text": "It still shows up — truncation only hides messages temporarily, it doesn't actually delete them.",
      "correct": false,
      "feedback": "Truncation here really does remove those messages from the array you're about to send — it isn't 'hiding' them. If that line needs to reach the model again, some other mechanism has to carry it back (write it into a summary or external memory); you can't count on truncation to keep it around on its own."
    }
  ]
}
```

## Compaction: squeeze the window down to one summary

Truncation's problem is that it discards whole stretches. Is there a way to free up space without throwing information away entirely? That's the problem **compaction** solves. The official Cookbook defines it this way: "Compaction distills the contents of a context window into a high-fidelity summary, letting the agent continue with minimal performance degradation when the conversation gets long."[^S2]

Unlike truncation's "delete a whole stretch," compaction is a "rewrite the whole thing": earlier conversation history is compressed into a single **high-fidelity summary** that replaces the long run of raw messages and stays at the front of the window. What the summary keeps is "what happened and what was concluded"; what it drops is the word-for-word raw dialogue detail.

The docs spell out the parameters of this mechanism. There's a default **trigger threshold** — compaction fires automatically when window usage hits 150K tokens; the threshold is configurable but can't go below 50K tokens, a server-enforced floor[^S2][^S8]. Each trigger is a discrete replacement: the big stretch of history gets swapped for the summary, and new messages keep appending normally after it. This isn't a one-time event — the docs are explicit that a long conversation can compact more than once, and "The last compaction block reflects the final state of the prompt, replacing content prior to it with the generated summary."[^S8] When it compacts again, the earlier compaction block is folded into the new summary along with the rest of history; compaction is a whole-transcript operation where "user messages, assistant messages, tool calls, tool results, even prior compaction blocks are all flattened into the summary."[^S2]

Compaction isn't free. The act of compacting costs an extra model call (the summarizer model runs)[^S2], and however carefully written, the summary is a lossy version of the original — "The summary preserves key decisions and facts but may drop specific numbers or exact phrasing."[^S2] If a later step happens to depend on a tiny detail that got summarized away (the exact spelling of some variable, say), that detail may be gone. That's also why compaction fits the coarse-grained problem of "the overall context got too big" rather than serving as a cure-all for every kind of history bloat.

## Tool-result clearing: clear only the part that goes stale

A big contributor to history bloat is tool calls themselves. Every time an Agent reads a file or runs a command, the full return value gets stuffed into history — read a file a few thousand lines long and those thousands of lines sit in the `messages` array as-is, even ten turns later when nobody needs the detail anymore. The Cookbook calls this out directly: "Tool-result clearing addresses the bloat from tool use itself. As an agent pulls in tools and calls them, the results pile up, and deciding how much of that tool output to keep becomes an increasingly important part of managing context."[^S2]

**Tool-result clearing** is the mechanism aimed squarely at this: it "drops old, re-fetchable results while keeping the record that the call happened."[^S2] That's the key distinction — clearing drops the concrete content the tool returned (those few thousand lines of file content), but it doesn't erase the record that "the Agent called `read_file` with this path." If that content is needed again later, the Agent knows what tool it called and what arguments it passed, and can decide whether to call it again to fetch the content back.

Its trigger threshold and retention policy have clear defaults too: clearing fires when window usage hits 100K tokens, and by default keeps the full results of the most recent 3 tool calls, clearing out older tool results[^S2]. The 100K trigger is lower than compaction's 150K, which fits its role — deal first with tool output, the part that "bloats easiest and is easiest to re-fetch," and if that isn't enough, hand the overall window off to compaction.

```agentmentor-check
{
  "id": "mem-zh-02-compaction-vs-clearing",
  "label": "Pick the better history-management mechanism",
  "prompt": "An Agent called the read_file tool a dozen times in a row, each time reading back a few thousand lines of code, and history is now packed with those raw file contents. Window usage is racing toward the ceiling. Is this a better fit for compaction, or for tool-result clearing?",
  "whyHere": "We just covered compaction and tool-result clearing separately. This checks whether the learner can choose based on 'what is the specific source of the bloat' rather than treating the two mechanisms as interchangeable synonyms.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Tool-result clearing — the bloat mostly comes from re-fetchable tool output, which is exactly what clearing is built for.",
      "correct": true,
      "feedback": "Right. Nearly all the bloat here is read_file return content — the kind of content you can just read again once it's stale, which matches clearing's role of 'drop stale, re-fetchable results, keep the call record.' Its default trigger (100K) is also lower than compaction's (150K), so it can step in sooner."
    },
    {
      "id": "b",
      "text": "Compaction — it can distill everything into one summary, which is less work overall.",
      "correct": false,
      "feedback": "Compaction can handle overall window bloat, but its role is a 'whole rewrite' and what it produces is a lossy summary. The source of the bloat here is specific — those few thousand lines of re-readable file content — so dropping the stale results and keeping the call record fits better than folding it all into a summary, and it avoids compaction's extra model call."
    },
    {
      "id": "c",
      "text": "No difference — pick either one, they both just free up window space in the end.",
      "correct": false,
      "feedback": "They solve different problems: compaction rewrites the whole window's history into one high-fidelity summary, while tool-result clearing only drops stale, re-fetchable tool output and keeps the call record. The specific source of the bloat here (re-fetchable tool results) is what makes clearing the closer fit."
    }
  ]
}
```

## Choosing among the three: a mental model

We now have two mechanisms, and adding the external memory that Lesson 3 covers makes three. The Cookbook gives a compact mental model that sorts out their division of labor: "compaction compresses the whole window when it grows too large, clearing drops stale re-fetchable data inside the window, and memory moves information out of the window so it survives across sessions."[^S2]

Their priorities and use cases aren't competing — they're layered:

- Tool-result **clearing** handles "this content is still in the window but it's gone stale, and dropping it is fine because it can be re-fetched" — the most targeted, the least costly.
- **Compaction** handles "the whole window has grown too large," regardless of where the content came from, rewriting it all into one summary — broader reach, but lossy and it costs an extra model call.
- **Memory** (the next lesson's topic) handles "this information shouldn't only live in this one conversation, it needs to last into the next session" — it isn't solving "the window can't hold everything" at all, but "once this conversation ends, everything in the window disappears."

Back to the question this lesson opened with: history only grows because nobody actively clears it. Truncation, compaction, and tool-result clearing are three ways of clearing it at different costs and for different situations — which one you pick depends on what you want to keep and how much you're willing to pay to keep it.

<!-- exercises -->
## 💻 Exercises

### Level 1: Pick the right mechanism for three scenarios

For each of the three scenarios below, judge whether truncation, compaction, or tool-result clearing fits best, and explain why (the reason has to land on "the specific source of the bloat" or "whether you can afford to lose detail" — not just "this one seems more suitable").

1. A code-review Agent repeatedly calls `grep_code` to search the codebase, each call returning a few dozen lines of matches. Window usage is near the ceiling, but the review task isn't finished.
2. A support Agent has been chatting with a user for 60 turns. The window has grown large overall, holding both tool calls and long stretches of user and Agent dialogue — the content comes from all over.
3. A note-taking assistant Agent needs to know, at the start of each new daily session, a long-term preference the user mentioned last week ("no spicy food"). This session itself has only just started, and the window is nowhere near full.

<!-- rubric -->
- Scenario 1 picks tool-result clearing, with a reason that names the bloat coming from re-fetchable tool return content
- Scenario 2 picks compaction, with a reason that the content comes from all over and needs a whole rewrite rather than clearing a single source
- Scenario 3 picks memory (not truncation/compaction/clearing), with a reason that the root problem is "surviving across sessions," not "this window can't hold everything"

<!-- answer -->
Reference answer: Scenario 1 should use **tool-result clearing** — almost all the bloat comes from `grep_code`'s stale, re-fetchable return results, so clearing the old results while keeping the call record lets you search again when needed, with none of compaction's extra overhead. Scenario 2 should use **compaction** — the content comes from all over, both tool calls and long dialogue, so it isn't a single-source problem; you need to rewrite the whole window into one high-fidelity summary to free up space while keeping the overall thread. Scenario 3 isn't something truncation, compaction, or tool-result clearing can solve — this session's window is nowhere near full, and the real problem is that "the preference mentioned last week is simply invisible to this session." That's the "survive across sessions" problem that **memory** solves, not a "this window can't hold everything" problem, and it's for the next lesson to cover in detail.

<!-- hint -->
Start by asking yourself: in this scenario, is the problem "this conversation's window is about to run out of room," or "information can't carry over from the last conversation to this one"? Those two kinds of problem call for completely different solutions.

<!-- hint -->
Recall the mental model from the "Choosing among the three" section — clearing targets stale, re-fetchable data inside the window, compaction targets an overall window that's too large, memory targets surviving across sessions. Their jobs don't overlap.

### Level 2: Diagnose code that truncates into a bug

The pseudocode below tries to clear history when window usage runs too high, keeping only the most recent messages:

```javascript
function trimHistory(messages, maxKeep) {
  if (messages.length <= maxKeep) return messages;
  return messages.slice(-maxKeep);
}
```

Suppose the `messages` array at some point is in exactly this order: `[..., { role: "assistant", content: [tool_use block] }, { role: "user", content: [tool_result block] }, ...]`, and `maxKeep` happens to split those two messages apart, keeping only the `tool_result` one and cutting the `tool_use` one.

Explain what problem this causes when sent to the model, and give a fix that avoids it (no full code needed — just make the idea clear).

<!-- rubric -->
- Points out the model sees a tool_result message with no corresponding tool_use, so the protocol structure is broken
- States the consequence: the model may error or behave in confused ways, not merely "have incomplete information"
- The proposed fix must guarantee the cut point never lands in the middle of a tool_use / tool_result pair (e.g. cut by complete "round-trips" as the unit, not by message count)

<!-- answer -->
Reference answer: Cutting this way leaves the model with a `tool_result` message whose corresponding `tool_use` block is nowhere to be found in history — the protocol requires that every `tool_result`'s `tool_use_id` match a `tool_use` earlier in the history, and that match is now broken, so the model errors out on the structural anomaly (the docs' error is the "tool_use ids were found without tool_result blocks immediately after" family)[^S7]. The fix: don't cut by counting messages — cut with "one complete round-trip" as the smallest unit. If an `assistant` message contains a `tool_use` block, it has to be kept or dropped together with the `user` message right after it that carries the matching `tool_result`; you can't slice a round-trip apart in the middle.

<!-- hint -->
Recall "the full round-trip of a tool call" from the previous course — `tool_use` and `tool_result` are a pair bound by `tool_use_id`, and the protocol expects them to always appear together.

<!-- hint -->
Rather than counting "keep the last N messages," flip the approach: first group history into "one complete round-trip" units, then decide how many recent groups to keep, instead of slicing the message array directly.

<!-- /exercises -->

## Recap

- Conversation history only grows by default: each turn's messages pile up in the window, earlier turns are kept in full, and with nobody actively clearing it, it climbs without limit
- Truncation is the simplest, but what it drops is irreversible, and if the cut point lands in the middle of a `tool_use` / `tool_result` pair, it breaks the tool call's protocol structure
- Compaction rewrites the whole window's history into one high-fidelity summary, firing by default at 150K tokens (the threshold can't go below 50K, server-enforced), at the cost of being lossy and one extra model call; a long conversation may compact more than once, with earlier summary blocks folded into the new summary[^S2][^S8]
- Tool-result clearing only drops stale, re-fetchable tool output while keeping the call record, firing by default at 100K tokens and keeping the last 3 calls' results — more targeted than compaction
- The three have different jobs: clearing handles stale re-fetchable data, compaction handles an overall window that's too large, memory handles surviving across sessions — which one you pick depends on the specific source of the bloat and whether you can afford to lose detail

[>> Lesson 3: External Memory: Files and Retrieval](./03-external-memory-files.md)
