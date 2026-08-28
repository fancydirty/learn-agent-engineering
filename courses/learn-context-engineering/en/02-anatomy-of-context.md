# Lesson 2: Anatomy of Context: System Prompt, Tools, and Examples

> Learning goals:
> - Take apart the context of a single LLM request (system prompt, tool definitions, examples, message history) and explain why all four are spending the same attention budget
> - Diagnose the "altitude" problem in a system prompt — hardcoded and brittle at one end, vague and signal-free at the other — and rewrite it to the right altitude
> - Audit tool definitions and examples through the lens of context cost: merge overlapping functionality, trim what comes back, and replace a list of edge cases with a few canonical examples
>
> Prerequisites: You've finished Lesson 1 and accept the premise that context is a finite resource | Prev: [Lesson 1 <<](./01-from-prompt-to-context.md) | Next: [Lesson 3 >>](./03-just-in-time-context.md)

## Open the Hood: What's Actually Loaded in a Request

Lesson 1 borrowed Anthropic's definition: context engineering is "the set of strategies for curating and maintaining the optimal set of tokens (information) during LLM inference"[^S1]. That's still abstract — which tokens does "the optimal set" actually consist of? This lesson does one thing: opens the hood so you can see what's loaded into the window every time a request goes out.

You hand-wrote a harness loop back in "Agent Harness Fundamentals: Loops and Control," so the shape of a request should be familiar. Sorted by what it holds, the context of a single request is roughly these four blocks:

```text
Context of one request
├── System prompt (role, rules, background knowledge)
├── Tool definitions (each tool's name, description, parameter schema)
├── Examples (few-shot: input/output samples that portray the expected behavior)
└── Message history (user messages, model replies, each turn's tool calls and results)
```

Here's what matters: these four aren't four sealed-off pockets, they're neighbors in one window. "LLMs have an "attention budget" that they draw on when parsing large volumes of context," and "Every new token introduced depletes this budget by some amount"[^S1]. An extra paragraph of padding in the system prompt is attention the message history doesn't get; ten tools sitting in the manifest that nobody ever calls thin out the share the examples receive. And as Lesson 1 covered, "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases"[^S1] — a degradation that arrives as a slope, not a drop, since "These factors create a performance gradient rather than a hard cliff"[^S1]. Which is why waste in any one block never announces itself with an error. It just quietly makes the whole thing a little dumber, and by the time you notice, you usually can't point at the line that did it.

The four blocks also grow at different rates. System prompt, tool definitions, and examples are basically static — however long you wrote them, that's how long they stay. Message history swells inside the loop instead, because "An agent running in a loop generates more and more data that could be relevant for the next turn of inference"[^S1]. In the harness you built in "Agent Harness Fundamentals: Loops and Control," the line that pushes each turn's tool result onto the `messages` array is that swelling, live. What to do about history isn't this lesson's job — Lesson 4, "Compaction and Notes: Context Management for Long Tasks," is dedicated to it. This lesson gets the three static blocks under control, since those are the fixed cost you pay on every single turn.

Turning "context, therefore, must be treated as a finite resource with diminishing marginal returns"[^S1] into something you can act on means asking each block the same question: how much behavioral improvement did these tokens buy? Let's go block by block.

## The Altitude of a System Prompt: Two Ways to Fail

Anthropic's engineering write-up uses "altitude" for the level of abstraction a system prompt sits at, and names two failure extremes. At one end, "engineers hardcoding complex, brittle logic in their prompts to elicit exact agentic behavior"[^S1]. At the other, "vague, high-level guidance that fails to give the LLM concrete signals for desired outputs"[^S1]. Let's write three versions of a system prompt for the same order-support agent, so both traps and the good answer sit side by side.

**Flying too low** — the logic gets hardcoded:

```text
You are an order support agent. Follow these rules exactly:
1. If the user says "it never arrived," reply with template A.
2. If the user says "it arrived damaged," reply with template B and issue a $10 coupon.
3. Order numbers starting with TB: check shipping first. Starting with JD: check inventory first.
4. If the user's message contains the word "complaint," hand off to a human.
… (14 more rules omitted)
19. When a user matches both rule 2 and rule 4, rule 4 wins.
20. If nothing above matches, reply "Sorry, I'm not sure I understand."
```

Each rule covers exactly the case it spells out. What happens when the user writes "the box got crushed" instead of "damaged"? No rule catches it, so it falls through to rule 20 and plays dumb. Worse, the rules start fighting each other, so you add rule 19 to referee — and at that point you're writing an if-else interpreter in natural language. Every addition makes the prompt longer, more brittle, and more expensive in attention, while the cases you didn't write down will always outnumber the ones you did.

**Floating too high** — nothing but slogans:

```text
You are an order support agent. Be professional and friendly, handle user problems flexibly, and keep users happy.
```

You saved the tokens, but the model gets no concrete signal at all. Where's the boundary on refunds? How much compensation can it authorize? What has to go to a human? It's all guesswork. "Keep users happy," pushed to its limit, can mean refunding money that should never have been refunded — and that's not disobedience, that's you telling it nothing.

**The right altitude** — Anthropic's standard is a prompt that's "specific enough to guide behavior effectively, yet flexible enough to provide the model with strong heuristics"[^S1]:

```text
You are an order support agent. Your goal is to resolve the user's post-purchase problem within a single conversation.

Judgment principles:
- If an order hasn't shipped, you can refund on request; if it has shipped, guide the user to refuse delivery or start a return.
- Damage, wrong item, and missing item are our fault: offer compensation up front, don't wait for the user to ask.
- When fault is unclear, confirm the key facts first (order number, photos), then decide.

Hard limits (never cross):
- No single compensation above $50 — hand off to a human above that.
- Any conversation involving physical injury or a legal dispute: hand off to a human immediately and flag it.
```

Look at the structure of that version: **principles do the generalizing, red lines do the compliance**. "The box got crushed" isn't written verbatim into any rule, yet it lands naturally under "damage is our fault"; the things that genuinely aren't negotiable (the compensation ceiling, legal disputes) are pinned down as a handful of hard limits. It's less than half the length of the 20-rule version and covers strictly more ground.

There's a shortcut question for judging altitude: **faced with a case you didn't write down, does this prompt give the model a direction to reason from?** The low version can't (it only knows how to fall through), the high version gives an empty direction ("happy"), and the right-altitude version gives principles that transfer.

```agentmentor-check
{
  "id": "ctx-zh-02-altitude-fix",
  "label": "Diagnose the altitude problem in a hardcoded system prompt and pick the fix",
  "prompt": "A returns-review agent has a system prompt with 18 rules shaped like 'if the user says X, do Y', ending with 'if nothing above matches, reply that the request cannot be processed'. In production, every request whose wording the rules failed to anticipate drops into that catch-all branch. Which approach actually fixes this at the root?",
  "whyHere": "The section just put three versions of a support prompt side by side — too low, too high, and right. This swaps in a fresh scenario to check that you can spot the underlying disease of a low-altitude prompt on your own, and choose between 'keep adding branches' and 'raise it to principles' without the comparison in front of you.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Rewrite the 18 special cases as a few judgment principles plus a small number of hard limits, so the principles cover wordings nobody enumerated while the real compliance red lines stay pinned down.",
      "correct": true,
      "feedback": "Principles generalize to wordings that were never enumerated, and hard limits hold the line on what isn't negotiable — that's exactly the altitude that's specific enough to guide behavior yet leaves the model strong heuristics. The prompt also gets shorter, so the attention budget buys more."
    },
    {
      "id": "b",
      "text": "Keep the structure and subdivide the catch-all: track which wordings missed in production and add a few new if-then rules to the prompt every week.",
      "correct": false,
      "feedback": "Adding rules only chases wordings that have already shown up; anything new still lands in the catch-all. The list grows, conflicts between rules get likelier, and every turn of inference pays attention for a manifest that keeps getting longer."
    },
    {
      "id": "c",
      "text": "Delete all 18 rules and replace them with a single line, 'handle return requests flexibly and prudently', to save the maximum number of tokens.",
      "correct": false,
      "feedback": "That jumps from one extreme to the other. The tokens are saved, but 'flexibly and prudently' carries no concrete signal, so the model has no idea where the return boundaries or its authority sit, and behavior drifts unpredictably. Saving tokens only works if the heuristics that guide behavior survive."
    }
  ]
}
```

## The Always-Loaded Layer: CLAUDE.md Discipline

The system prompt isn't only the string you typed. Plenty of harnesses park project-level configuration permanently in the system layer, and Claude Code's CLAUDE.md is the canonical case: the docs say "CLAUDE.md is a special file that Claude reads at the start of every conversation."[^S4] "Read every time" means every line of it spends attention budget in every session, which is why the discipline the docs impose on it is strict.

Rule one: only put in what applies broadly — "CLAUDE.md is loaded every session, so only include things that apply broadly."[^S4] A build command only one subdirectory needs, a convention only one kind of task needs: neither has earned a seat in the always-loaded layer.

Rule two: run a deletion test line by line. "Keep it concise. For each line, ask: "Would removing this cause Claude to make mistakes?" If not, cut it."[^S4] This isn't fastidiousness. The docs warn outright that "Bloated CLAUDE.md files cause Claude to ignore your actual instructions!"[^S4] That's the attention budget made concrete — every optional line you stuff in dilutes the few lines that genuinely matter. The same page goes so far as to call the context window "the most important resource to manage," noting that "Claude's context window fills up fast, and performance degrades as it fills."[^S4]

So where does the rarely-needed-but-occasionally-essential material live? Claude Code's answer is skills: loaded on demand, since "Claude loads them on demand without bloating every conversation."[^S4] That pairing — keep the resident layer minimal, fetch the rest when needed — is exactly Lesson 3's subject, so let's just book it here.

One aside: if your own project has an AGENTS.md, a `system_prompt.txt`, or anything similar sitting permanently in context, run the same deletion test on it. Bloat in the always-loaded layer is the sneakiest kind — it never shows up in any one turn of the conversation, and it taxes every one of them.

## Tools Are Context: The Definition Costs, and So Does the Return

A tool shows up in context twice: its **definition** rides along with every request, and its **return value** enters the message history. Both ends spend budget.

The earlier course "Agent Tool Calling: Getting Agents to Actually Do Things" covered the functional side of tool design — how to define parameters, how to handle errors. This lesson takes a different angle: every tool definition is a stretch of tokens the model has to read and understand. Anthropic's bar is that "tools should be self-contained, robust to error, and extremely clear with respect to their intended use"[^S1], and that you're "building tools that are well understood by LLMs and have minimal overlap in functionality"[^S1]. Here's a pair that fails both (schemas abbreviated for readability):

```json
[
  {
    "name": "get_order_info",
    "description": "Look up an order.",
    "parameters": { "order_id": "string" }
  },
  {
    "name": "search_order",
    "description": "Also looks up orders, supports keywords.",
    "parameters": { "keyword": "string" }
  }
]
```

Both tools can look up an order, both descriptions are vague, and the boundary between them isn't something even their author pinned down. That's the whole point of the "minimal overlap in functionality"[^S1] requirement: pile up tools with fuzzy boundaries and you've handed the model the "which one do I use?" question fresh on every turn. Merge them into one and state the purpose and behavior clearly, and the question disappears:

```json
[
  {
    "name": "search_orders",
    "description": "Look up an order by exact order number, or search orders by keyword. Returns at most 5 results by default, each with only four fields: order number, status, amount, order date. For the full field set, re-query a single order number with detail=true. Returns an empty list when nothing matches; does not error.",
    "parameters": {
      "query": "Order number or search keyword",
      "detail": "Boolean, whether to return the full field set, default false"
    }
  }
]
```

That description says more than "what it does" — it spells out the shape of what comes back and what happens when there's nothing to return, which is "robust to error"[^S1] made literal: the model doesn't have to guess what a miss looks like, so it's far less likely to invent some odd recovery move when a lookup comes up empty.

Now the return side. Anthropic asks for tools "returning information that is token efficient and by encouraging efficient agent behaviors"[^S1]. A tool that dumps back an order's forty-plus internal fields plus its complete audit log pours a bucket of low-value tokens into the message history on every call — and those tokens stay in the history, taxed again on every turn that follows. "Trim by default, `detail=true` on demand," as in the example above, is the standard shape of the fix.

Finally, the tool manifest itself needs subtraction. Ten tools in context that never get called are still billed in full every turn for their definitions. Auditing a tool list and auditing a CLAUDE.md are the same motion — would removing it cause mistakes? If not, cut it.

## Examples: Pick Canonical Ones, Don't Pile Up a List

Examples (few-shot) are the third static cost. Their usual rot goes like this: every production badcase gets a matching example added to the prompt, and six months later you own a 30-entry catalog of edge cases. Anthropic is blunt about it — don't "stuff a laundry list of edge cases into a prompt"[^S1]; instead "curate a set of diverse, canonical examples that effectively portray the expected behavior of the agent"[^S1].

"Canonical" means one example stands for a **class** of behavior, not one specific situation. Back to the support agent: three examples are enough to frame the whole behavior space.

1. **The standard flow**: the full walk of looking up the order, assigning fault, offering a resolution.
2. **Taking responsibility up front**: we shipped the wrong item, and compensation is offered before the user asks.
3. **Escalation**: it's beyond the agent's authority, so it explains politely and hands off to a human.

"Diverse" means those three cover different branches of the judgment, rather than being three variations on the same behavior.

So where do the edge cases go? Most of them should be promoted back up to the principle layer of the system prompt. "What if the user is abusive" doesn't need a 300-token full conversation example; one principle — "when a user is upset, stay measured and keep the focus on solving the problem" — does the job. Examples teach what the expected behavior looks like; principles teach which direction to reason in when something new shows up. You may already have spotted it: adding an edge case to the example list and adding a branch to the system prompt are two faces of the same coin — both are patching at low altitude, and only rising to the principle layer actually seals the gap.

## A Block-by-Block Checklist: Putting the Anatomy to Work

Collapsing this lesson into something executable. Before you add anything to context, run the matching question:

| Block | Question to ask |
|---|---|
| System prompt | Is the altitude right? Faced with a case you didn't write down, does it give the model a direction to judge from?[^S1] |
| Always-loaded files | Does this line apply broadly? Would removing it cause mistakes?[^S4] |
| Tool definitions | Is the purpose clear enough? Does it overlap another tool? Is the return trimmed by default?[^S1] |
| Examples | Does each one stand for a class of behavior? Is the list creeping longer again?[^S1] |
| Message history | Not handled here — see Lesson 4, "Compaction and Notes: Context Management for Long Tasks" |

There's one more principle worth carrying out of this lesson, beyond the table. Writing about building agent systems, Anthropic offers a sense of proportion: "you should consider adding complexity only when it demonstrably improves outcomes."[^S2] The original context is system architecture, but it holds just as well for every block of context — one more tool, one more rule, one more example is all added complexity. Make it prove it buys behavioral improvement before you let it on board.

That's a pass over all three static blocks. But there's a further question waiting: some information shouldn't be loaded into the window ahead of time at all — rather than guessing what the model will need, let the agent go find it at runtime. That's what the next lesson is about.

<!-- exercises -->
## 💻 Exercises

### Level 1: Rewrite a Rule List to the Right Altitude

Here's the system prompt for an expense-approval agent:

```text
You are an expense approval assistant. Approve according to these rules:
1. Taxi receipts under $100: approve directly.
2. Taxi receipts of $100 or more: ask for a trip description.
3. Meal receipts between 12:00 and 14:00 on a weekday: approve directly.
4. Meal receipts on a weekend: reject.
5. Office supplies in the "electronics" category: send to a manager.
6. Receipts whose billing name doesn't match the company name: reject.
7. If nothing above matches, reject with the note "please contact office admin."
```

Under this set, a hotel receipt from a business trip isn't caught by any rule and gets rejected by rule 7 every time; a weekday dinner receipt satisfies neither rule 3 nor rule 4 and falls into the same catch-all. Do two things: (1) name which failure extreme this prompt sits at, and explain why this symptom is inevitable for that kind of prompt; (2) rewrite it to the right altitude, with a version that covers both of the unhandled cases above.

<!-- rubric -->
- Identifies the prompt as sitting at the "hardcoded, brittle logic" extreme, and explains that the catch-all swallowing new cases is the inevitable result of enumerated rules (the cases you didn't write down always outnumber the ones you did)
- The rewrite is built on two or three judgment principles (amount size, how routine the category is, whether the paperwork is consistent) rather than enumerating scenarios one by one, so hotel receipts, weekday dinners, and other new cases land inside a principle
- Keeps the genuine hard limits (a mismatched billing name must be rejected, large amounts go to a manager) and gives a path for uncertain cases (reject with a note on what's missing) instead of leaving the model to guess
<!-- answer -->
(1) This prompt sits at the "hardcoded, brittle logic" extreme: it defines behavior by enumerating specific scenarios, and each rule covers only the case it spells out. Enumeration can never catch up with the combinations the real world produces — hotel receipts and weekday dinners aren't in the list, so they can only drop into the catch-all. Adding rule 8 and rule 9 doesn't touch the structural problem; it just makes the list longer and the conflicts likelier.

(2) A reference rewrite at the right altitude:

```text
You are an expense approval assistant. Your goal is to clear approvals quickly without breaking policy.

Judgment principles:
- Approve directly when the amount is small, the category is routine, and the paperwork is complete and consistent.
- Ask for an explanation before deciding when the amount is on the large side, or when it falls outside what's normal for that category (a large late-night meal, say).
- When the paperwork doesn't line up with what's being claimed, reject and state exactly what's missing, so the employee can fix it in one pass.

Hard limits (never cross):
- A billing name that doesn't match the company name is always rejected.
- Anything over $1000 in a single claim goes to a manager.
- Don't guess when you're unsure: reject and say what documentation is needed.
```

A business-trip hotel receipt now lands inside the general judgment about amount, category, and paperwork consistency. A weekday dinner at a normal amount in a routine category falls under the first principle and gets approved; if it's the large-late-night kind that sits outside the norm, it falls under "ask for an explanation." The genuine red lines buried in the original seven rules (mismatched billing name, and high-value categories like electronics, which the amount ceiling absorbs) survive as hard limits, and everything else is promoted to the principle layer.
<!-- hint -->
Go rule by rule and ask: is this "a principle that applies to every expense," or "a special case for one specific scenario"? The more special cases, the lower the altitude.
<!-- hint -->
Pull out the compliance red lines that must hold unconditionally and list them separately as hard limits, then try folding the remaining rules into two or three judgment principles — and self-test the coverage by asking which principle a hotel receipt would land in.

### Level 2: Run a Context-Cost Audit on Tools and Examples

You've inherited an e-commerce support agent. Its context holds the three tool definitions below (schemas abbreviated), plus a few-shot list of 12 examples whose content is all edge cases like "what to do when the user makes a typo" and "what to do when the user asks the same question twice":

```json
[
  {
    "name": "query_order",
    "description": "Query an order.",
    "parameters": { "order_id": "string" }
  },
  {
    "name": "search_order_by_text",
    "description": "Query orders, supports fuzzy search.",
    "parameters": { "text": "string" }
  },
  {
    "name": "get_order_full_dump",
    "description": "Returns every field of an order, including 40-plus internal fields and the complete audit log.",
    "parameters": { "order_id": "string" }
  }
]
```

Run a context-cost audit: (1) point out the overlapping functionality in the tool list and give a merge plan; (2) explain how the merged tool makes its return token-efficient while keeping the necessary information reachable; (3) give a plan for reworking the example list: what kind of examples should stay, and who should handle the edge cases.

<!-- rubric -->
- Recognizes that all three tools overlap on "look up an order," proposes merging them into a single tool, and explains that duplicate tools with fuzzy boundaries push the "which one?" decision onto every turn of inference
- The merged tool returns a few key fields by default with the full set available on demand (a detail parameter, say), and its description states the shape of the return and the behavior when nothing matches
- The example plan keeps a small number of canonical examples covering distinct typical behaviors, with most edge cases promoted to principles in the system prompt rather than enumerated one example at a time
<!-- answer -->
(1) All three tools do the same job — look up an order: `query_order` by exact ID, `search_order_by_text` by fuzzy text, `get_order_full_dump` by ID for everything. Each definition is vague on its own and overlapping with the others, so before every call the model has to work out where the boundaries between them lie — boundaries the definitions never state. Merge into one tool:

```json
[
  {
    "name": "search_orders",
    "description": "Look up an order by exact order number, or search orders by text. Returns at most 5 results by default, each with only order number, status, amount, and order date. For the full field set, re-query a single order number with detail=true. Returns an empty list when nothing matches; does not error.",
    "parameters": {
      "query": "Order number or search text",
      "detail": "Boolean, whether to return the full field set, default false"
    }
  }
]
```

(2) Token efficiency comes from "trim by default, full set on demand": day-to-day questions only need status and amount, so those are all that come back by default; when internal fields are genuinely needed, `detail=true` pulls the full record for one order instead of flooding the message history with forty-plus fields and an audit log on every call — content that stays in the history and gets billed again on every subsequent turn. Stating the result cap and the empty-result behavior in the description means the model never has to guess what a miss looks like.

(3) Swap the 12 edge-case examples for 3 canonical ones, each standing for a class of behavior: a standard-flow example that looks up an order and answers normally, a judgment example where we're at fault and offer compensation up front, and an escalation example where the request exceeds the agent's authority and goes to a human. Typos and repeated questions don't deserve a few-hundred-token full example each; promote them to a principle in the system prompt ("read the user's intent rather than their literal spelling; when a question repeats, first check whether the previous answer solved it").
<!-- hint -->
Start by counting how many tools can accomplish the same job, then check whether their descriptions let anyone tell at a glance which to use when.
<!-- hint -->
"Canonical" means an example that stands for a class of behavior. Sort the expected behaviors into classes first (standard flow, taking responsibility, escalation…) and pick the most illustrative one per class; for edge cases that don't fit any class, consider a principle instead of an example.
<!-- /exercises -->

## Recap

- The context of one request is four blocks — system prompt, tool definitions, examples, message history. They share a single attention budget, and every new token depletes it by some amount[^S1].
- Context is a finite resource with diminishing marginal returns[^S1]; asking block by block "what did these tokens buy" is far more actionable than vaguely "tweaking the prompt."
- A system prompt has two failure extremes — hardcoded brittle branches, and vague slogans that carry no signal. The right altitude is specific enough to guide behavior yet flexible enough to leave the model strong heuristics[^S1], and "principles plus hard limits" is the practical structure for landing there.
- Always-loaded content like CLAUDE.md gets read at the start of every conversation: include only what applies broadly, and run the deletion test on each line, because bloated files make the model ignore your actual instructions[^S4].
- Tools spend budget at both ends, definition and return: keep the intended use extremely clear, overlap minimal, and returns token-efficient[^S1]; tools that never get called are still billed in full every turn.
- Curate a few diverse, canonical examples instead of stuffing in a laundry list of edge cases[^S1]; most edge cases belong back at the principle layer.
- Before adding any complexity to context, remember Anthropic's sense of proportion: add it only when it demonstrably improves outcomes[^S2].

[>> Lesson 3: Just-in-Time Retrieval: Letting the Agent Fetch Its Own Context](./03-just-in-time-context.md)
