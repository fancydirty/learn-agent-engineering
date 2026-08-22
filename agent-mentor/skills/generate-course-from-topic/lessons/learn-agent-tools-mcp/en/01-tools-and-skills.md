# Lesson 1: Two ways to give an agent a capability

> Lesson objectives:
> - State the difference between a Skill and an MCP server in terms of what the agent does with each.
> - Decide, for a capability you want, which of the two mechanisms can deliver it and which cannot.
> - Name the three primitives an MCP server can expose, and say which one this course is about.
> - Explain what "tool" means inside an agent loop, and why that makes a tool an interface rather than a function.
>
> Prerequisites: You have used a coding agent on a real task and can read JSON | Previous [<< Course contents](./README.md) | Next [02 >>](./02-host-client-server.md)

## You keep pasting the query result into chat

The agent is working on a bug and needs to know which rows in the staging database have a null `tenant_id`. So you switch to a SQL client, run the query, copy forty lines, and paste them back. Ten minutes later it needs the deploy log. You paste that too.

Nothing about this is a model limitation. The agent can reason about the rows perfectly well once it has them. What it cannot do is *get* them: the database is not in the conversation, and no amount of describing it changes that. You are the transport.

There are two different fixes, and picking the wrong one costs you a week. One is to write down the procedure so the agent can follow it — that is a Skill. The other is to give the agent something it can *call* that reaches the database itself — that is what this course is about. This lesson draws the line, once, so the rest of the course can stay on one side of it.

## Explanation

### What a tool is inside an agent loop

Start with the loop itself, because "tool" only means something inside it. Anthropic's patterns essay describes agents as systems that "are typically just LLMs using tools based on environmental feedback in a loop," where "LLMs dynamically direct their own processes and tool usage, maintaining control over how they accomplish tasks."[^S11]

Read that carefully: the model decides which tool to call and when. A tool is not a function you invoke — it is a capability you *offer*, described in text, that the model chooses from. The specification is explicit about this: "Tools in MCP are designed to be **model-controlled**, meaning that the language model can discover and invoke tools automatically based on its contextual understanding and the user's prompts."[^S6]

That single word — model-controlled — is the source of everything else in this course. Because the model chooses, the description has to be good enough to choose from (Lesson 4). Because the model chooses, something other than the model has to be able to say no (Lesson 6).

### The line against a Skill

An **Agent Skill** is a portable workflow written for the agent to read: a folder of Markdown and supporting files describing how to perform some kind of work, which the agent loads when the work matches. An **MCP server** is an external capability the agent calls: a running process that exposes operations over a protocol and executes them itself.

The difference that matters is *who does the work*.

| | Skill | MCP server |
|---|---|---|
| The agent... | reads it and then acts | calls it, and it acts |
| Delivers | knowledge and procedure | execution and reach |
| Runs | nothing — it is text the model reads | a process, local or remote |
| Can reach a system the agent cannot | No | Yes — that is the point |
| Holds credentials | No, and must not | Yes, on its own side |

Apply it to the pasted query. A Skill can hold *how your team writes tenant-scoped queries* — the conventions, the gotcha about soft-deleted rows, the order to check things in. What a Skill cannot do is open a connection to the database. That requires something that runs.

The test in one sentence: **if the capability you want requires reaching a system that is not on the agent's side of the wall, no amount of writing will produce it.** Skills have their own course; from here this course is entirely about the second column.

### What a server can expose

The **Model Context Protocol (MCP)** is an open protocol for connecting agents to external systems. A server built on it can expose three kinds of thing, and the docs name them precisely: "**Resources**: File-like data that can be read by clients (like API responses or file contents)"; "**Tools**: Functions that can be called by the LLM (with user approval)"; and "**Prompts**: Pre-written templates that help users accomplish specific tasks."[^S12]

The parenthesis in the middle one is the whole design. A tool is a function *the model can call*, and it is called *with user approval* — the two halves of the trust model, stated in one line.

This course is about tools. Resources and prompts are real and useful, but tools are where the agent acts on the world, and they are where every judgment call in this course lives. As of the 2026-07-28 specification, a server declaring the `tools` capability "**MUST** respond to `tools/list` requests with the set of tools currently available to the requesting client."[^S6]

### The trigger: when it is worth connecting something

You do not want a server for everything. The trigger is behavioural, and Claude Code's documentation states it in a form you can check against your own week: "Connect a server when you find yourself copying data into chat from another tool, like an issue tracker or a monitoring dashboard. Once connected, Claude can read and act on that system directly instead of working from what you paste."[^S13]

That is the same signal you noticed in the opening. You are the transport, repeatedly, for the same system. The threshold is repetition: one lookup is a lookup, the fourth is a missing capability.

The inverse trigger matters as much. Anthropic's tools guidance is blunt about the failure mode on the other side: "More tools don't always lead to better outcomes. A common error we've observed is tools that merely wrap existing software functionality or API endpoints — whether or not the tools are appropriate for agents."[^S10] Every tool you connect spends context on every request that could reach it. Lesson 4 returns to this with a way to decide.

### What most servers actually are

Worth calibrating early, because it deflates the mystique. In one survey of MCP builders, "58% of MCP builders are wrapping existing APIs rather than building from scratch. Only 23% are creating new APIs specifically for MCP."[^S14]

Handle that number carefully. It comes from a vendor's survey of "technical professionals from our network and the broader MCP community," run from mid-November to mid-December 2025, with no sample size published on the page and a self-selected respondent pool.[^S14] It is not a measurement of the ecosystem. What it is good for is one directional point: most people building a server are putting a new front on an API they already have, not inventing a new system. If you have an API, you are closer to a server than you think.

```agentmentor-check
{
  "id": "agent-tools-mcp-boundary-which-mechanism",
  "label": "Choose between reading and calling",
  "prompt": "Your team has a documented triage procedure: when a Sentry alert fires, check whether the error appears in the last deploy's diff, look up which service owns the file, and open a ticket assigned to that team. The procedure is written down and stable. You want your agent to do this end to end. What do you need?",
  "whyHere": "This is the exact case where the two mechanisms look interchangeable, because the task is genuinely a documented procedure — which pulls hard toward the wrong answer.",
  "copyPurpose": "Have the agent check whether I am trying to solve a reach problem by writing a better procedure document.",
  "mode": "single",
  "choices": [
    {
      "id": "skill-only",
      "text": "A Skill — the procedure is written down and stable, which is exactly what a Skill is for",
      "correct": false,
      "feedback": "The procedure half is right, but the procedure is not the blocker. Three of the four steps require reaching a system the agent has no connection to: Sentry, the deploy history, and the ticket tracker. A Skill is text the model reads; reading a perfect description of Sentry does not produce the alert. The procedure is the easy half and it is already solved."
    },
    {
      "id": "both",
      "text": "Servers for the systems it must reach, and optionally a Skill for the judgment steps",
      "correct": true,
      "feedback": "The task splits cleanly along the who-does-the-work line. Reaching Sentry, the repository history, and the tracker each requires something that runs and holds credentials — that is server territory. The ordering and the ownership-lookup convention are knowledge the model can act on once it has the data, so they can live in a Skill or in the tool descriptions themselves."
    },
    {
      "id": "one-server",
      "text": "One MCP server that implements the whole triage procedure as a single tool",
      "correct": false,
      "feedback": "Possible, but it collapses a decision the model should be making into a black box. The procedure has judgment in it — which file owns the error, whether this is a duplicate — and a single `triage_alert` tool forces the server to make those calls with none of the conversation's context. Servers expose capabilities; the sequencing across them is what the model is for."
    },
    {
      "id": "prompts",
      "text": "A prompt template, since the procedure is a repeatable request",
      "correct": false,
      "feedback": "Prompts are a real MCP primitive, but they are pre-written templates that help a user start a task — they carry wording, not reach. The template would still be describing three systems the agent cannot open a connection to."
    }
  ]
}
```

## Worked example: sorting four wants into two piles

Here is a real-shaped list from one team's backlog of \"can the agent just…\" requests. Watch each one hit the who-does-the-work test.

**1. "Can it check whether this migration will lock the users table?"**
Does this need reach? Partly — it needs the migration file, which is already in the repository the agent can read. The rest is knowledge: which Postgres operations take an `ACCESS EXCLUSIVE` lock, and what your team considers acceptable. **Skill.** Nothing new needs to run.

**2. "Can it tell me which customers hit the rate limiter yesterday?"**
The data lives in a logging system with an API and an access token. There is no version of writing this down that produces the rows. **Server.** This is the case the protocol exists for.

**3. "Can it open the PR with our template and the right reviewers?"**
Two halves. The template and the reviewer-assignment convention are knowledge — Skill. Actually creating the PR is an authenticated write to a system across the network — server. **Both**, and note which half is which: the write is the part that needs a permission boundary (Lesson 6).

**4. "Can it stop suggesting `any` in our TypeScript?"**
No reach required, no procedure either. This is a repository convention, and it belongs in the repository's instruction file — a third mechanism, which has its own course. **Neither.** Not every want is one of the two things this lesson compares.

Two of four needed something to run. That ratio is normal, and the one that needed both is the most common shape of all.

## Your turn: sort your own three

Open the last week of your agent conversations and find three moments where you were the transport — you copied something in, or you did something by hand because the agent could not.

For each, answer in order:

- What system holds the thing? ________
- Could the agent reach it today, at all? ________
- If no: is the gap knowledge, or is it reach? ________
- Verdict: Skill / server / both / neither ________

The answer you are looking for is the third line. If you find yourself writing "the agent knows how, it just can't get to it," you have found a server-shaped hole, and Lesson 2 is about what fills it.

Worked answer for the shape you will most likely hit: *"Agent needed the current on-call rotation. System: PagerDuty. Reachable today: no. Gap: reach — the agent knows what an on-call rotation is. Verdict: server."* If instead you wrote "the agent got the data and drew the wrong conclusion," that is not a reach problem at all, and connecting a server will not fix it.

```agentmentor-action
mode: reasoning_audit
label: pressure-test my Skill-versus-server split on the three I just sorted
description: Probes whether I sorted by "who does the work" or drifted into sorting by how hard each item felt, which is the mistake that produces a Skill nobody can run.
purpose: Get the agent to challenge each of my three verdicts one at a time, so I find the one I classified by effort rather than by reach.
rules:
  - Ask about one of my three items at a time, starting with whichever verdict I sound least sure about.
  - Do not tell me the verdict. Ask what system holds the data and whether the agent can open a connection to it today.
  - If my reasoning appeals to how complicated the task is rather than what it needs to reach, name that specifically.
```

<!-- exercises -->
## 💻 Exercises (point these at your own real environment)

### Level 1 (warm-up)
Take the three items you sorted above and write a one-line justification for each verdict, using only the who-does-the-work test. Then find one item in your own backlog that you would have sorted differently a week ago, and write what changed your mind.

<!-- rubric -->
- Each justification names a specific system by name (not "our infrastructure") and states whether the agent can reach it today.
- No justification uses task difficulty, frequency, or importance as its reason — only reach versus knowledge.
- The "both" items, if any, are split into named halves: which part is procedure, which part is the call.
- The changed-mind item names the specific fact that changed the verdict.
<!-- answer -->
A justification that holds up looks like: "Deploy history — GitHub Actions API — agent cannot reach it, has no token, no way to list runs. Gap is reach. Verdict: server." A justification that does not hold up looks like: "Deploy history — this is complicated and comes up a lot. Verdict: server." The second one reaches the right answer by luck; applied to item 4 in the worked example it would have produced a server for a TypeScript style rule.

The most common changed-mind case is discovering that something you assumed needed reach is already in the repository. Test logs, migration files, and CI configuration are all frequently local, and an agent that can read files already has them.
<!-- hint -->
For each item, finish this sentence before writing anything else: "The data lives in ______ ." If you cannot name a system, the item may not be a reach problem at all.
<!-- hint -->
Split any item where you wrote "and" in the middle. "Look up the owner and open a ticket" is two items with two different verdicts.
<!-- hint -->
If two of your three items point at the same system, that system is your candidate for Lesson 6's terminal task — note it now.

### Level 2 (advanced)
Pick the strongest server-shaped item from Level 1. Before you connect anything, write a one-page decision note answering: what would the tool be called, what would it take as input, what would it return, and what is the smallest version of it that would still have saved you the copy-paste? Then answer the harder question: what would it cost to have this tool available on every request, including the hundreds that have nothing to do with this system?

<!-- rubric -->
- The tool has a name, at most three named inputs with types, and a stated return shape.
- The "smallest version" is genuinely smaller than the full capability — it names something you deliberately left out.
- The cost answer refers to context spent on every request, not to money or latency.
- The note states one condition under which you would decide not to connect this at all.
<!-- answer -->
A good note narrows hard. "Full read access to the logging API" becomes "`logs_search(query, since)` returning at most 50 matching lines" — and you name what you dropped: aggregation, arbitrary time ranges, the other six indices.

The cost answer is the one people skip. A tool's name, description, and input schema are loaded into the model's context so it can decide whether to call it — that is why the guidance warns that "More tools don't always lead to better outcomes" and that wrapping every endpoint is a known error.[^S10] Your note should conclude with something like: "Three tools, roughly 200 words of description, present on every request in this project." The decide-not-to condition is usually one of: the copy-paste happens twice a month, or the system holds data that must not enter a model's context at all.
<!-- hint -->
Write the tool call you wish you could have made last Tuesday, as a single line of JSON arguments. The parameter names in that line are your input schema.
<!-- hint -->
For the smallest version, ask what you would cut if you had to ship it in an hour. Whatever survives is the tool; what you cut is version two.
<!-- hint -->
For the cost question, count the words. A tool whose description you cannot get under a paragraph is usually two tools.
<!-- /exercises -->

## Where this leaves you

You can now tell a reach problem from a knowledge problem, and you have at least one candidate system of your own. You know that a tool is model-controlled — offered rather than invoked — and that it comes with user approval attached, which is a promise something has to keep.

What you do not yet have is any picture of what sits between your agent and that system. "The agent calls the server" is three words hiding four components, and one of them is holding your credentials. Lesson 2 draws the actual shape, and shows you what a server is structurally unable to see — a guarantee that turns out to be the foundation of everything in Lesson 6.
