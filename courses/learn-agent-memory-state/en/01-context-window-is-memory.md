# Lesson 1: The Context Window Is All the Memory an Agent Has

> Learning goals:
> - Explain why "the Agent remembers our earlier conversation" is an illusion
> - Name what counts toward a single request's context window and what doesn't
> - Explain what context rot is, and why a bigger window isn't automatically better to work with
> - Judge whether an API call is stateless, and what that means for memory
>
> Prerequisites: the first four courses in this series, including the round-trip protocol of tool calls from Agent Tool Calling: Getting Agents to Actually Do Things | Next: [Lesson 2 >>](./02-managing-conversation-history.md)

## A conversation that looks like it remembers

You're chatting with a customer-support Agent:

```text
User: My name is Sarah, order number ORD-2026-8842.
Agent: Got it, Sarah. Let me check on ORD-2026-8842 ... it's out for delivery, expected tomorrow.
User: What about the one I bought last time?
Agent: Do you mean ORD-2026-8842? That one arrives tomorrow — if you're asking about a different order, could you give me the order number?
```

In the second turn the Agent clearly "remembers" your name is Sarah and remembers you asked about ORD-2026-8842. It looks as if it filed those details away somewhere and can pull them back up next time.

The truth is far plainer. On every request, your code repacks **every message from the start of the conversation up to now** and sends it to the model as-is.[^S6] The model isn't seeing "I remember your name is Sarah" — it's re-reading "the user said: my name is Sarah" from scratch, every single time. Every sentence from the previous turn, every tool call, has to be placed into this turn's request by your own code. The model stores nothing on its own.

## The API call is stateless

Put it even more bluntly: between one call and the next, nothing is quietly kept for you on the server. Once this request is processed, those tokens vanish from the model's view. If the next request carries nothing, the model sees a blank slate — it doesn't even know your name.

The reason it feels like memory is that the host application does the grunt work for you: it resends the full array of history messages. That isn't a model capability; it's an array in your code that keeps growing. This property has a name — **stateless**. In the words of the official docs: "The Messages API is stateless, which means that you always send the full conversational history to the API."[^S6] The server keeps no private per-session state across requests; all "memory" has to be carried and resent by the client itself.

## What's actually in the context window

Everything the model can see lives in a container called the **context window**. The docs are explicit that everything in a request counts: "Everything in the request counts toward the context window: the system prompt, every message in messages (including tool results, images, and documents), and your tool definitions. The output Claude generates for the turn, including its extended thinking, counts too."[^S1]

```json
{
  "model": "claude-sonnet-5",
  "system": "You're a customer-support assistant ...",
  "tools": [ { "name": "get_order_status", "...": "..." } ],
  "messages": [
    { "role": "user", "content": "My name is Sarah, order number ORD-2026-8842." },
    { "role": "assistant", "content": "Got it, Sarah ..." },
    { "role": "user", "content": "What about the one I bought last time?" }
  ]
}
```

In this request, `system`, `tools`, and all three messages in the `messages` array count toward the context window. Once the model's reply is generated, those output tokens count toward this same turn's window usage too. The response carries a **`usage` field** that tells you how many input and output tokens the turn actually consumed: "Every response reports what the request consumed in its `usage` field."[^S1]

Anything not packed into this request — say an order record sitting in a database that no tool has queried yet — is not part of the context window. The model can't see it and can't know it exists out of thin air. That's why "memory" has to be actively carried into this request by some mechanism; it isn't automatically reachable.

```agentmentor-check
{
  "id": "mem-zh-01-stateless-check",
  "label": "Work out what the model can see on the next request",
  "prompt": "In the first turn the user told the Agent \"my name is Sarah,\" and the Agent replied normally. If the second request's messages array contains only what the user just said this turn, and not the two messages from the first turn, will the model still remember the user's name is Sarah?",
  "whyHere": "You've just learned that the API call is stateless and history has to be resent by the client. This checks whether the learner still has a leftover instinct that \"the model stored the conversation itself,\" instead of grasping that if the history isn't packed into this request, the model simply can't see it.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Yes, because the model already stored that detail in its own memory while handling the first turn",
      "correct": false,
      "feedback": "No. The API call is stateless — no server-side state is shared between one call and the next. Once the first turn is processed, those tokens are no longer visible to the model. There's no such thing as \"the model remembering it itself.\""
    },
    {
      "id": "b",
      "text": "No, because the context window only holds what's actually sent in this request, so history that wasn't packed in doesn't exist to the model",
      "correct": true,
      "feedback": "Right. The context window holds what this request actually carries — the system prompt, the messages array, the tool definitions. If the two first-turn messages weren't placed into the second turn's messages, the model sees a blank slate, and the name \"Sarah\" never appeared for it at all."
    },
    {
      "id": "c",
      "text": "Yes, because history messages under the same user ID get linked automatically by the server",
      "correct": false,
      "feedback": "There's no such automatic linking. Whether context carries across requests depends entirely on whether the client put the history messages back into the messages array and sent them again — it has nothing to do with a user ID."
    }
  ]
}
```

## The window rots — bigger isn't better

There's a ceiling on how much the window holds — the capacity differs by model, and the official figure runs up to 1 million tokens: "The context window (up to 1M tokens, depending on the model) holds the conversation history plus the new output Claude generates."[^S1] But that doesn't mean you should cram it as full as possible. The docs name a specific phenomenon, **context rot**: "As token count grows, accuracy and recall degrade, a phenomenon known as *context rot*. This makes curating what's in context just as important as how much space is available."[^S1] In other words, the more content the window holds and the more cluttered it gets, the worse the model becomes at pulling the right answer out of it — which makes *what* you put into context matter as much as how much room is left.[^S1]

This shapes memory design directly: dumping the whole history into context isn't free (it fills window capacity), and it isn't without cost either (it makes the model work harder to find the one sentence that's actually relevant right now, buried in a pile of stale information). Lesson 2 covers how to handle that **accumulation** in practice — how to truncate history, how to summarize it, instead of letting it grow without limit.

## The word "memory" is really a metaphor

Back to that support conversation at the start. When we say "the Agent remembers your name is Sarah," the accurate way to put it is: your code resent the complete history — the one containing "my name is Sarah" — to the model as-is, one more time, and the model re-read it inside this request. No storage, no recall, only a **resend**.

This isn't splitting hairs. Understanding that "memory is an illusion produced by resending" directly shapes how you design an Agent that genuinely "remembers":

- If the history array grows without limit, the window fills up sooner or later, and you hit context rot on top of that — the problem Lesson 2 solves.
- If some information needs to persist across **multiple sessions** (not just within this one conversation), you can't count on stuffing it into the messages array; it has to be written somewhere external — the external memory Lesson 3 covers.
- If the Agent needs to know "how far along I am" partway through a task, that progress likewise has to be **structured state** visible in the context window, not something the model guesses at — the subject of Lesson 4.

All three threads are different corollaries of the same fact: the model knows only what's in the window; whatever isn't in the window doesn't exist as far as the model is concerned.

<!-- exercises -->
## 💻 Exercises

### Level 1: Mark what counts toward the context window

Below is an actual request sent to the model (simplified), plus three things that "also exist" but do **not** appear in this request:

```json
{
  "model": "claude-sonnet-5",
  "system": "You're an order assistant.",
  "tools": [ { "name": "get_order_status", "input_schema": { "...": "..." } } ],
  "messages": [
    { "role": "user", "content": "Look up ORD-2026-8842 for me" }
  ]
}
```

The three extra things that exist:

1. The actual contents of the ORD-2026-8842 order record in the database (never queried by any tool yet)
2. A shipping address the same user mentioned last week in a session with a different Agent
3. The reply text the model generates after this request is processed

For each, decide: of these four kinds of content (`system` / `tools` / the user message in `messages` / the three extra items above), which count toward this request's context window and which don't, with one sentence of reasoning each.

<!-- rubric -->
- Correctly identifies that `system`, `tools`, and the user message in `messages` all count toward the context window
- Correctly identifies that the order record and last week's shipping address don't count right now, because they weren't placed into this request
- Correctly identifies that the model's generated reply text counts toward **this turn's** window usage, even though it's produced after the request is processed

<!-- answer -->
Reference answer: `system`, `tools`, and the user message in `messages` are all in this request, so all three count toward the context window. The order record in the database and the shipping address mentioned last week appear in no field of this request, so right now they don't exist for the model and don't count toward the window — unless some tool later queries the order record and packs it into `messages` as a `tool_result`, at which point it counts toward some later turn's window. The reply text the model generates this turn also counts toward this turn's window usage, because the model's output is itself part of the window.

<!-- hint -->
There's only one test: did the thing actually appear in the JSON request sent to the model? If it didn't, it doesn't count, no matter how "objectively real" it is in the database.

<!-- hint -->
The model's output is easy to miss — it's "generated," but the act of generating consumes window capacity too, and the response's `usage` field folds that in.

### Level 2: Find the wrong assumption in this description

A colleague describes an Agent they're designing like this: "Our conversation is already 20 turns deep, and the database stores the full history, so even if this turn's request only sends the user's latest sentence, the model can keep the conversation going, because the server knows it's the same session."

Point out the wrong assumption in this description, and explain what scenario it breaks in if it were actually built this way.

<!-- rubric -->
- Clearly identifies that the error is assuming the server automatically links the same session's history messages
- Explains that the API call is stateless, and the model only sees the `messages` content this request actually carries
- Gives one concrete "breaks here" scenario, such as the model suddenly "forgetting," answering off-topic, or erroring

<!-- answer -->
Reference answer: the wrong assumption is "the server knows it's the same session" — believing that if the database stores the history, the model can automatically see it. In reality the API call is stateless, and the model can only see what the `messages` array carries in this one request. Whether the database stores history and whether the model can see it this turn are two separate things; in between, the client has to actively put the history messages back into the request. Built this way, the 21st request sends only "what about the one I bought last time," and the model sees an isolated question with no context at all — it will most likely answer off-topic or ask back "which order do you mean," looking as if the Agent suddenly "lost its memory." But it never "forgot"; it simply never "saw."

<!-- hint -->
Ask yourself: is history "stored" in the database the same thing as history "included" in the JSON request sent to the model this time?

<!-- hint -->
Recall this lesson's "the API call is stateless" section — the server keeps no private per-session state across requests, which is a fatal blow to the wrong assumption in this problem.

<!-- /exercises -->

## Recap

- "The Agent remembers our earlier conversation" is an illusion: the truth is the host application repacks the full history into every request, and the model stores nothing itself[^S6]
- The API call is stateless; the server keeps no private per-session state across requests, so all "memory" has to be actively carried by the client[^S6]
- The context window holds everything this request actually carries: the system prompt, every message in `messages` (including tool results, images, documents), the tool definitions, and the model's own output for the turn[^S1]
- The window has a size ceiling, and bigger isn't automatically better to use — context rot means the more tokens you pile up, the more accuracy and recall degrade[^S1]
- Grasping that "the model knows only what's in the window" leads straight into the problems the next three lessons solve: how to manage history, how to externalize memory, how to structure state

[Lesson 2: Managing Conversation History: Append, Truncate, Summarize >>](./02-managing-conversation-history.md)
