# Lesson 3: What the stateless core guarantees

> Lesson objectives:
> - State what "stateless" means as a normative requirement on a server, not as a slogan.
> - Name what every request must carry now that there is no handshake.
> - Predict what happens when a client and server disagree about the protocol version.
> - Explain where state went, and why an explicit identifier is the only place it can live.
> - Distinguish the protocol core from an extension, and say why that boundary was drawn.
>
> Prerequisites: Lesson 2 — you can trace a call across host, client, and server | Previous [<< 02](./02-host-client-server.md) | Next [04 >>](./04-descriptions-are-the-interface.md)

## The tutorial you found does not describe this protocol

You went looking for how MCP works and found a clear explanation: the client opens a connection, sends `initialize`, the server replies with its capabilities, the two sides settle on a version, and from then on the session remembers who it is talking to.

That was true. It is not true of the revision this course is written against. The `initialize` handshake was removed, sessions were removed, and the header that carried session identity was removed.[^S2] A tutorial written before that describes a protocol that no longer exists — and worse, it describes one whose central assumption is now explicitly forbidden.

This lesson is what replaced it. It is the most version-sensitive material in the course, so every claim below carries the revision it was written against, and the last section tells you how to check whether that revision is still current.

## Explanation

### Which revision, and how to check

Protocol revisions are dated. The specification states the scheme: "The Model Context Protocol uses string-based version identifiers following the format `YYYY-MM-DD`, to indicate the last date backwards incompatible changes were made,"[^S1] with each revision marked Draft, Current, or Final.

As of 2026-08-23, the specification's versioning page states: "The **current** protocol version is **2026-07-28**."[^S1] Everything in this lesson describes that revision.

Do not take that on my word past today. The versioning page is short and it names the current version in one line — read it before you rely on anything below. If it names a later date, this lesson's mechanics are a historical description and the changelog for that later revision will tell you what moved.

### Stateless, as a requirement

Here is the core rule, quoted rather than paraphrased because paraphrase softens it:

> "The Model Context Protocol (MCP) is a **stateless protocol**: all the information needed to process a request is contained in the request itself. A server processes each request independently; no state should be inferred from previous requests, even those on the same connection or stream."[^S5]

The normative consequences are spelled out. Servers "**MUST NOT** rely on prior requests over the same connection to establish context (e.g., capabilities, protocol version, client identity)."[^S5] Servers "**SHOULD NOT** require that a client reuse the same connection or process to perform related operations."[^S5]

And the sentence that dissolves the old mental model entirely: "an open connection, such as a STDIO process, is not a conversation or session: clients may interleave unrelated requests on the same transport."[^S5]

That sentence is aimed squarely at the **stdio transport**, where the server is a process launched beside your client — the most session-like arrangement in the whole architecture, and explicitly not a session. The specification goes further and tells clients not to treat it as one: they "**SHOULD NOT** use an individual task, thread, or conversation as the lifetime boundary for the stdio process."[^S5] The HTTP side lost even more: **Streamable HTTP** kept its name across the revision but no longer carries a session identifier at all, since the header was removed along with protocol-level sessions.[^S2]

If you have built HTTP services, this is a familiar bargain and you already know what it buys. The maintainers' own framing of the change: "MCP is transforming from a bidirectional stateful protocol into a request/response stateless protocol,"[^S3] and, in the roadmap published a month later, "a remote MCP server is now no different from any other HTTP workload."[^S15]

### What every request carries instead

Statelessness has to be paid for somewhere, and the payment is per-request metadata. In place of a handshake that established these things once, each request carries them in a `_meta` field.[^S2]

As of the 2026-07-28 specification, client requests carry:[^S5]

| Key | Required | What it is |
|---|---|---|
| `io.modelcontextprotocol/protocolVersion` | Yes | The revision this request uses, e.g. `"2026-07-28"` |
| `io.modelcontextprotocol/clientCapabilities` | Yes | What the client supports, relevant to this request |
| `io.modelcontextprotocol/clientInfo` | No | Client name and version; SHOULD be sent |
| `io.modelcontextprotocol/logLevel` | No | Minimum log level for this request |

The enforcement is strict: "A request missing any required field is malformed; the server **MUST** reject it with JSON-RPC error code `-32602` (Invalid params)."[^S5]

Your SDK fills these in. The reason to know they exist is diagnostic: when a call fails with an invalid-params error and your arguments look fine, the metadata is the other thing that could be wrong.

One trap worth naming. `clientInfo` and `serverInfo` look like identity, and they are not: "`clientInfo` and `serverInfo` are self-reported by the sender and are not verified by the protocol... Implementations **SHOULD NOT** rely on them for security decisions."[^S5] A server that decides what to expose based on the client name it was told is trusting a string anyone can send.

### Version disagreement, and discovery

Because the version rides on each request, agreement is per-request too. "the server accepts or rejects each request independently," and on mismatch "it responds with an `UnsupportedProtocolVersionError` listing the versions it does support. The client can then retry the request with a mutually supported version."[^S1]

There is also a way to ask up front. The 2026-07-28 revision added `server/discover`, and made it mandatory to implement: "servers MUST implement this RPC to advertise their supported protocol versions, capabilities, and identity."[^S2] Calling it is not mandatory — "Clients that want to select a version up front can call `server/discover`... Calling it is optional: a client is free to send any request directly and handle a version error if one comes back."[^S1]

Note the asymmetry, because it is a design pattern you will meet again: the server must offer it, the client may ignore it. What comes back is the **server capabilities** declaration — the counterpart to the client capabilities riding on each request, and the only place a server states what it can do now that there is no greeting.

One more shape you will meet on the wire. Every result now carries a required `resultType`, where `"complete"` means the final content and `"input_required"` means the server needs something before it can finish.[^S5] That second case is the **input-required result**: it carries an `inputRequests` field naming what is needed, and the client answers by retrying the original request with `inputResponses` and any `requestState` the server supplied — with the mechanical catch that "the JSON-RPC `id` **MUST** be different between the initial request and the retry."[^S6] This is how a server now asks a question, including an **elicitation** for user confirmation: it cannot call you, so it answers with a request. Clients meeting an older server that omits `resultType` "**MUST** treat an absent `resultType` as `\"complete\"`."[^S5]

### Where state went

You still have state. A shopping cart, an open transaction, a browser context — real things that span calls. If the protocol will not carry them, where do they live?

The changelog answers directly: "Servers that need cross-call state use explicit, server-minted handles passed as ordinary tool arguments."[^S2] And the base protocol makes it normative: "State that needs to span multiple requests (e.g., long-running tasks, application-level handles) **MUST** be referenced by an explicit identifier the client passes on each request."[^S5]

The tools specification shows the shape, marked as non-normative guidance: a creation tool returns a handle, and later tools accept it as an argument.[^S6]

```jsonc
// → tools/call
{ "name": "create_basket", "arguments": {} }

// ← result
{
  "content": [{ "type": "text", "text": "Created basket bsk_a1b2c3" }],
  "structuredContent": { "basket_id": "bsk_a1b2c3" }
}

// → tools/call
{
  "name": "add_item",
  "arguments": { "basket_id": "bsk_a1b2c3", "sku": "..." }
}
```

Now read the sentence that follows it in the specification, because it is the one with consequences: "The model is responsible for carrying `basket_id` forward."[^S6]

State that used to be the connection's problem is now something the model has to keep track of and pass correctly. That has two effects you will feel. It means your tool descriptions must make the handle's role obvious (Lesson 4). And it means possession of a handle is now something an attacker might want — which the security guidance names as its own attack class, with the rule that servers "**MUST NOT** treat possession of a state handle as authentication."[^S7]

### Core versus extension

The last structural idea. Not everything in MCP is in the core, and the 2026-07-28 revision made that boundary formal by adding an "`extensions` field to `ClientCapabilities` and `ServerCapabilities` to support optional extensions beyond the core protocol."[^S2]

An extension is "optional additions to the specification that define capabilities beyond the core protocol," identified by a namespaced string like `io.modelcontextprotocol/tasks`.[^S8] Two properties matter for you as a user:

- "Extensions are always disabled by default and require explicit opt-in from the developer."[^S8]
- "SDKs can choose to implement extensions, but it's not required for protocol conformance."[^S8]

So a feature being *in MCP* and a feature being *available to you* are different questions. When both sides do not support an extension, "the supporting side needs to either fall back to core protocol behavior or reject the request."[^S8] Lesson 5 is about the extension you are most likely to want.

```agentmentor-check
{
  "id": "agent-tools-mcp-stateless-where-state-lives",
  "label": "Locate cross-call state under the current core",
  "prompt": "You are writing a server that opens a database transaction in one tool call and commits it in a later one, against the 2026-07-28 specification. Where does the transaction identity live between the two calls?",
  "whyHere": "Everyone who has written a stateful service reaches first for the connection, and under this revision that is not merely discouraged — a server relying on it is violating a MUST NOT.",
  "copyPurpose": "Have the agent check whether my server design is still assuming the connection can carry identity between two tool calls.",
  "mode": "single",
  "choices": [
    {
      "id": "connection",
      "text": "On the connection — both calls arrive over the same transport, so the server can key the transaction by connection",
      "correct": false,
      "feedback": "This is the specific thing the revision forbids: servers 'MUST NOT rely on prior requests over the same connection to establish context.' The specification also notes that an open connection is not a conversation — a client may interleave unrelated requests on the same transport, so connection identity does not even mean what you would need it to mean."
    },
    {
      "id": "session-header",
      "text": "In a session identifier the transport assigns, carried in a header on both requests",
      "correct": false,
      "feedback": "That mechanism existed and was removed in this revision, along with protocol-level sessions and the session header on Streamable HTTP. Reaching for it means you are working from documentation written against an earlier revision."
    },
    {
      "id": "handle",
      "text": "In a handle the server mints, returned from the first call and passed back as an ordinary argument to the second",
      "correct": true,
      "feedback": "This is the documented replacement: state spanning requests 'MUST be referenced by an explicit identifier the client passes on each request', and the tools guidance shows the create-then-pass shape. Two consequences follow — the model has to carry the handle forward, so your description must make that obvious, and the handle is not authentication, so the server must still check the caller on every call."
    },
    {
      "id": "client-memory",
      "text": "In the client library's memory, which re-establishes the transaction transparently when needed",
      "correct": false,
      "feedback": "A client can certainly remember a string, but it cannot re-establish a database transaction — that state lives inside the server. Putting the responsibility in the client also gets the direction wrong: the identifier is minted by the server, because only the server knows what it refers to."
    }
  ]
}
```

## Worked example: reading a failed call against the current core

A reader connects a server they wrote against an older tutorial. The first tool call fails. Here is how to read it, and why each step is the step.

**The error:**

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "error": { "code": -32602, "message": "Invalid params" }
}
```

**Step 1 — classify the error channel.** `-32602` is a JSON-RPC error, which means it is a protocol error: "issues with the request structure itself that models are less likely to be able to fix."[^S6] This is not the tool saying "your SQL was wrong" — the request never reached the tool's logic. That distinction is the subject of Lesson 4, and it saves you from debugging your arguments when the problem is one level up.

**Step 2 — check the required metadata.** Under this revision, `-32602` on a well-formed call is what a missing required `_meta` field produces: a request lacking `protocolVersion` or `clientCapabilities` "is malformed; the server **MUST** reject it."[^S5] If the client is old enough to be sending an `initialize` handshake, it is also old enough not to be attaching per-request metadata.

**Step 3 — ask the server what it speaks.** Rather than guessing, call `server/discover`, which every server at this revision must implement and which returns "supported protocol versions, capabilities, and identity in a single request."[^S1] If the reply lists only earlier versions, the mismatch is confirmed and the fix is on the server side.

**Step 4 — read the error you would have gotten instead.** Had the versions been the disagreement, the server would have returned `UnsupportedProtocolVersionError` listing what it supports.[^S1] Getting `-32602` rather than that tells you the request was malformed before version negotiation could even apply.

**What this diagnosis is not.** It is not a claim about what your specific client library does — SDKs differ in how much they surface. It is a way to read the wire. If your client hides the JSON, the equivalent first question is still "protocol error or tool error?", because the two have completely different fixes.

## Your turn: audit one server against the current core

Pick a server you have connected, or one you are considering, and answer four questions from its documentation and source rather than from memory:

1. Which protocol revisions does it claim to support? ________
2. Does anything in its docs describe an `initialize` step, a session ID, or "the session remembers"? ________
3. If it has state spanning calls, what is the handle called and which tools accept it? ________
4. Does it implement `server/discover`? ________

Question 2 is the fast tell. Language about a session that persists across calls means the server was written against an earlier revision — which is not automatically broken, since backward compatibility exists, but it means its documentation is describing different mechanics than the ones in this lesson.

For question 3, if you find a handle, ask the follow-up that the security guidance forces: does the server check who is calling on every request, or does it treat holding the handle as proof? The rule is that servers "**MUST NOT** treat possession of a state handle as authentication."[^S7]

```agentmentor-action
mode: mastery_probe
label: quiz me on which parts of my MCP knowledge came from a pre-2026-07-28 source
description: Surfaces the specific beliefs I hold that were true of an earlier revision — the handshake, sessions, resumable streams — without telling me which ones they are up front.
purpose: Find the stale assumptions in my own model of the protocol before I design a server around one of them.
rules:
  - Ask me one question at a time about how I think a specific mechanic works, and wait for my answer.
  - When my answer describes a mechanism that was removed, do not correct it immediately — first ask me where I learned it and roughly when.
  - Only after I have answered that, name the revision that changed it and what replaced it.
```

<!-- exercises -->
## 💻 Exercises (point these at your own real environment)

### Level 1 (warm-up)
Open the specification's versioning page and confirm for yourself what the current protocol revision is today. Then open the changelog for that revision and find three changes that would break a server written against the revision before it. Write each one as a sentence a colleague could act on.

<!-- rubric -->
- You state today's current revision and the date you checked, and say whether it matches the 2026-07-28 this course was written against.
- Three breaking changes are named specifically enough to act on — a removed method, a removed header, or a newly required field, not "the protocol changed."
- For each, you state what a server or client must now do instead.
- If the current revision is later than 2026-07-28, you note which of this lesson's claims the newer changelog supersedes.
<!-- answer -->
As of 2026-08-23 the current revision is 2026-07-28. Three breaking changes stated actionably, from that revision's changelog:[^S2]

1. The `initialize` / `notifications/initialized` handshake is gone; every request must instead carry its protocol version and client capabilities in `_meta`. A client that opens with `initialize` gets no session established.
2. Protocol-level sessions and the `Mcp-Session-Id` header were removed from Streamable HTTP. A server keying state by session must switch to server-minted handles passed as tool arguments.
3. Stream resumability was removed — no `Last-Event-ID`, no SSE event IDs. "A broken response stream loses the in-flight request; clients **MUST** re-issue it as a new request with a new request ID." Retry logic that assumed resumption must be rewritten.

Others available: `ping` and `logging/setLevel` removed; `server/discover` now mandatory for servers; every result carries a required `resultType`.

If the versioning page now names a later revision, the exercise still works — read that revision's changelog instead, and the third rubric point becomes the real deliverable.
<!-- hint -->
The versioning page states the current version in a single sentence near the top. Do not infer it from a URL you were given.
<!-- hint -->
In the changelog, the "Major changes" section is where the breaking ones are. Look for the words "Remove" and "MUST".

### Level 2 (advanced)
Take a system of your own that has real cross-call state — a cart, a session, an open file handle, a multi-step import — and design the handle for it. Write: the creation tool, the handle's name and format, which tools accept it, its stated lifetime, and what happens when an expired handle is used. Then answer the security question: what stops another caller from using a handle they obtained?

<!-- rubric -->
- The handle is opaque — it does not encode meaning an attacker could parse or guess.
- The lifetime is stated as a duration or condition, and you say where a user of the tool would learn it.
- Expiry behaviour is defined as a tool execution error carrying a recovery path, not a crash or a silent new handle.
- The authorization answer names a server-side check performed on every call, not a property of the handle itself.
<!-- answer -->
A design that holds up: `import_start(source)` returns `imp_` plus a UUIDv4; `import_add_rows` and `import_commit` take `import_id`; handles expire after one hour of inactivity, stated in the creation tool's description; a call against an expired handle returns a tool execution error reading "Import imp_… has expired after 60 minutes of inactivity. Start a new import with import_start."

The specification's guidance on handles asks for exactly these properties — authorization checked per call, opacity, a lifetime stated in the creation tool's description "so the model can see it when deciding to create state," and an expiry error that says so "so the model can recover by creating a new one."[^S6]

The security answer is the one people get wrong. It is not "the handle is long and random." Random handles resist guessing, but a leaked handle is still valid, which is why the rule is that servers "**MUST NOT** treat possession of a state handle as authentication" and **SHOULD** "bind handles server-side to the authenticated user, for example by keying stored state as `<user_id>:<handle>` where the user ID is derived from the verified token rather than supplied by the client."[^S7] The check happens on every call, against an identity the caller did not choose.

**Common mistake breakdown:** the tempting design is a handle that encodes what it points at — `cart_9f3_user_412_staging`. It debugs beautifully. It also tells anyone who sees one that user IDs are sequential integers, invites guessing at neighbours, and turns a log leak into a map of your namespace. The specification's guidance is the opposite: "Handles that encode internal structure invite parsing or guessing; opaque identifiers do not."[^S6] Keep the mapping on the server, where the debugging is just as easy and the leak is worth nothing.
<!-- hint -->
Write the creation tool's description first, including the lifetime sentence. If the lifetime is awkward to state, it is probably not defined yet.
<!-- hint -->
For the authorization check, write the line of pseudocode that runs at the top of every tool that accepts the handle. If you cannot write it, the design is not finished.
<!-- /exercises -->

## What is now pinned, and what is not

You can state what stateless requires of a server, name the two fields every request must carry, explain where cross-call state moved and why the model is now responsible for carrying it, and tell a core feature from an extension. You also have a habit worth more than any of it: checking the versioning page before trusting a claim about protocol behaviour, including the claims in this lesson.

The next problem is not protocol shape at all. Your server is connected, the metadata is correct, the tool is listed — and the model calls it with the wrong arguments, or does not call it when it should. Nothing failed. Lesson 4 is about the text that determines whether that happens.
