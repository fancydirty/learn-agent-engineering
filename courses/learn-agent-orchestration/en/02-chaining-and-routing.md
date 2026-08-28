# Lesson 2: Chain It, Route It: Chaining and Routing

> Learning goals:
> - Break a four-task prompt into a chain and articulate what you're trading and what you're gaining
> - Install programmatic gates between chain stages so unqualified intermediate results stop where they should
> - Decide when a task needs chaining, routing, both, or neither, and write the routing call as a single output-tightened cheap call
>
> Prerequisites: Read Lesson 1, can hand-write a harness loop driven by `stop_reason` (Course 7 in this series), understand deterministic verifiers (Course 10 in this series) | Previous: [<< Lesson 1](./01-when-one-loop-isnt-enough.md) | Next: [Lesson 3 >>](./03-parallelization.md)

## One prompt doing four things—one will drop

You need to write help documentation for a new feature: read product requirements → draft an outline → write the full text based on the outline → check the document for deprecated terminology.

Your first version probably stuffs all four steps into one prompt and hands it to a harness loop. The first run looks fine. The problem shows up on the second run, and the third: this time the outline is good but the text is missing a section; next time the text is complete but it's mixed with "user groups" that were deprecated last version; then it rewrites the outline halfway through and delivers an outline that doesn't match the text.

These failures look different on the surface, but they share the same root: in a single call, the model has to simultaneously juggle understanding requirements, designing structure, generating text, and doing consistency checks. You can't control which one gets squeezed out, and you can't see it happening. Worse, you have no place to intervene—by the time you have the output, all four things are done, and "outline didn't meet spec" is buried inside the final draft.

Lesson 1 discussed the axis of "who holds the plan." This one-shot prompt hands the plan entirely to the model. The first thing this lesson does is take it back.

## Chaining: trading latency for accuracy

The official definition of this pattern is just two sentences, and every word is load-bearing.

Prompt chaining decomposes a task into a sequence of steps, where each LLM call processes the output of the previous one. You can add programmatic checks (see "gate" in the diagram below) on any intermediate steps to ensure that the process is still on track[^S1]. When to use this workflow: This workflow is ideal for situations where the task can be easily and cleanly decomposed into fixed subtasks. The main goal is to trade off latency for higher accuracy, by making each LLM call an easier task[^S1].

"Making each LLM call an easier task"—that half-sentence gives you both diagnosis and cure. One call doing four things is a hard task; one call just drafting an outline and writing nothing is an easy task. Chaining doesn't reduce the work—it makes the work the model has to complete in each call simpler.

The cost is printed right on the price tag: latency. Each additional stage adds one complete round trip. Anthropic laid out this accounting at the start of the same article—agentic systems often trade latency and cost for better task performance, and you should consider when this tradeoff makes sense[^S1]. "Slow and expensive" isn't an accidental side effect of chaining.

```text
Requirements ──▶ Draft outline ──▶ Write full text ──▶ Check terms ──▶ Deliver
```

Each segment's input is the previous segment's output. If one link goes crooked, everything downstream follows.

## Each stage is a complete harness loop

A stage in the chain isn't "one API call"—it's **a complete harness loop**. The same while loop you hand-wrote in Course 7 in this series: send messages, check `stop_reason`, if it's `tool_use` then execute the tool and send the result back, otherwise return the text.

This usage has a source. When Anthropic described how to evaluate agents, the recommended setup was exactly this shape: direct LLM API calls, simple agentic loops (while-loops wrapping alternating LLM API and tool calls), one loop per evaluation task, each evaluation agent given a single task prompt and your tools[^S3]. That article was about evaluation, but the building block itself is general-purpose: one task, one loop, code-driven. Chaining is stringing these blocks together with code deciding the order.

The rest of the lessons use the same notation:

```javascript
// runAgent is the Course 7 harness loop wrapped in a function
// Input: one self-contained task prompt + tools available to this stage; output: final text after running to completion
const answer = await runAgent(client, task, tools);
```

The entire chain is sequential code you can read at a glance:

```javascript
const outline = await runAgent(client, outlineTask(req));
const g1 = gateOutline(outline);        // Gate 1: is the outline structure correct?
if (!g1.ok) fail(g1.why);               // If not, stop here—don't send it downstream

const doc = await runAgent(client, writingTask(outline));
const g2 = gateTerms(doc);              // Gate 2: does it contain banned deprecated terms?
if (!g2.ok) fail(g2.why);

const report = await runAgent(client, checkTask(doc), { read_glossary });
```

Notice what's **not** in these lines: no room for "the model decides what to do next." The sequence is hardcoded, intermediate results `outline` and `doc` are ordinary script variables. The model remains autonomous within each stage (it can call tools as many times as it wants), but control between stages is in the code's hands. A side benefit: each stage's prompt can be strict about just one thing. The outline prompt demands only titles and forbids any body text; the writing prompt focuses on style and banned terms—these two sets of requirements would clash if packed into one prompt.

This shape appears in products too. Claude Code's official documentation recommends for multi-step workflows: have Claude use subagents sequentially, each completes its task and returns results to Claude, which then passes relevant context to the next subagent[^S4]. The difference lands on Lesson 1's axis—in the product form, Claude decides "what to pass"; when you write the script, that's your code.

## Gates: moving Course 10 verifiers between stages

The last half-sentence in the definition is what chaining actually adds beyond "one big prompt": you can add programmatic checks on any intermediate steps to ensure that the process is still on track[^S1]. The original text calls these checks "gate," and it's in quotation marks: `(see "gate" in the diagram below)`—one straight, one curly, exactly as in the source, not a typo here.

"Programmatic" is the key: it's code, not another model call, just a few `if` statements.

Course 10 in this series taught deterministic verifiers: when something can be judged right or wrong by code, don't spend money asking the model. That course installed verifiers at **terminal state**—after everything runs, check if the output is acceptable. Chaining offers the same check a new location: **between stages**.

```javascript
function gateTerms(doc) {
  const hits = BANNED.filter((w) => doc.includes(w));
  if (hits.length > 0) {
    return { ok: false, why: `Document contains banned deprecated terms: ${hits.join(', ')}` };
  }
  return { ok: true };
}
```

Seven lines, not a single model call, same input always produces same judgment. It blocks exactly that "text mixed with deprecated terms" failure; a gate that counts how many chapter headings are in the outline is just as simple.

What to do when a gate fails is a design decision: **stop and report the error** (best when you're still tuning this chain, but the failure message must say which stage failed, otherwise you only know "it didn't work," not which stage prompt to fix), **feed the failure reason back into the same stage's prompt and retry** (with a retry cap), or **log it and continue with a fallback value** (only when this stage isn't load-bearing). Level 2 exercise uses the first approach.

This also settles the accounting from Course 6 in this series: work you delegate must have self-contained prompts—goal, output format, available tools, boundaries, all four written out. Each stage's task is a delegation prompt shaped exactly like that. These four elements have a precise primary source, which Lesson 4 will unpack item by item when it covers how orchestrators delegate.

## Routing: classify first, then dispatch

Chaining handles "one task broken into steps." Another class of tasks has a completely different shape: what comes in isn't one thing, it's several kinds of things, each with its own handling.

The official definition: routing classifies an input and directs it to a specialized followup task. This workflow allows for separation of concerns, and building more specialized prompts. Without this workflow, optimizing for one kind of input can hurt performance on other inputs[^S1].

The last sentence is why routing exists. Suppose customer emails fall into three categories: refund, incident, billing. You use one prompt to handle everything. To handle refunds well, you add a line "first confirm order number and payment channel"; this rule is pure noise for incident emails, and the model will use it to ask someone reporting a white-screen page for their payment channel. You add another line "if it's an incident, don't ask for order number," and the prompt starts growing patches on top of patches.

When to use this workflow: routing works well for complex tasks where there are distinct categories that are better handled separately, and where classification can be handled accurately, either by an LLM or a more traditional classification model or algorithm[^S1]. That last precondition isn't icing on the cake: if classification is wrong, it's wrong in a stealthy way—a refund email routed into the incident flow gets a conscientious troubleshooting response.

In code, routing is simpler than chaining:

```javascript
const HANDLERS = {
  refund: handleRefund,
  incident: handleIncident,
  billing: handleBilling,
  other: handleFallback,
};
const LABELS = Object.keys(HANDLERS);

async function classify(client, letter) {
  const raw = await runAgent(client, [
    'Goal: Classify the customer email below.',
    `Output format: Output only one word, chosen from: ${LABELS.join(', ')}. No explanation, no punctuation.`,
    `Email: ${letter}`,
  ].join('\n'));

  const label = raw.trim();
  return LABELS.includes(label) ? label : 'other';   // If it doesn't fit the table, go to fallback
}

const category = await classify(client, letter);
const reply = await HANDLERS[category](client, letter);
```

Three things worth noticing.

**Tighten the classification call's output to one word**—Course 10 in this series used the same trick when discussing LLM judges: list the allowed values, say no explanation, tightening the output makes the parsing step deterministic. **If it doesn't fit the table, go to fallback**—that line `LABELS.includes(label) ? label : 'other'` isn't defensive pedantry. The model occasionally returns "I think it might be incident, or maybe something else," and then `HANDLERS[that whole string]` is `undefined` and the next line crashes. Leave one fallback branch and the classification uncertainty is contained in this one line.

**The classifier doesn't have to be a model**—the definition explicitly says traditional classification models or algorithms count too[^S1]. If the email carries a fixed order-number format or comes from a dedicated form entry point, one regex is enough and much faster.

After dispatch, each handler can be anything: a harness loop, a chain, even a segment of completely model-free code.

```agentmentor-check
{
  "id": "orc-zh-02-chain-vs-one-prompt",
  "label": "Three calls vs. one big prompt",
  "prompt": "You broke the doc-writing chain into three stages. Your colleague reads it and says: 'Breaking it into three stages means calling the model three times—slow and expensive. One big prompt, let the model follow the three steps itself, wouldn't that work?' How do you respond?",
  "whyHere": "Chain, gates, and routing are all covered—this is the right place to align both the cost accounting and the preconditions for splitting. Both sides are only half right.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "He's right. Today's models are strong enough—if you write the steps clearly in one prompt, the model will follow them in order, same effect as splitting but saves two round trips of time and money.",
      "correct": false,
      "feedback": "This is exactly the shape of the opening scenario's failure. The official positioning for chaining is to make each LLM call an easier task; in one call, the model still has to simultaneously juggle understanding requirements, designing structure, generating text, and checking terminology—you can't control which one gets squeezed out."
    },
    {
      "id": "b",
      "text": "Splitting is always better. More model calls means more thinking opportunities. Whether the task can be cleanly decomposed doesn't matter—just split as much as you can, accuracy naturally goes up.",
      "correct": false,
      "feedback": "Too absolute. The official precondition for chaining is that the task can be easily and cleanly decomposed into fixed subtasks; tasks that can't be cleanly split will lose information stuck between stages. The cost your colleague worries about is also real money."
    },
    {
      "id": "c",
      "text": "Slow and expensive is real—chaining's positioning is exactly to trade latency for accuracy; but one big prompt has no place to put programmatic checks, so an unqualified outline will keep going all the way down.",
      "correct": true,
      "feedback": "Right. Both things are acknowledged: cost is what chaining explicitly prices in, and splitting gains not just easier per-call tasks but also the positions where you can install programmatic checks—a one-shot prompt doesn't even give you a place to intervene. The precondition also matters: if it can't be cleanly split, don't force it."
    }
  ]
}
```

## Two routing variants in current API vocabulary

The routing definition above comes from the late-2024 patterns article, which carries a banner saying its tooling-ecosystem descriptions are outdated. So it's worth checking: is this pattern still alive in current first-party vocabulary? Yes, and it's called out by name. Claude platform's multi-agent orchestration documentation has two entries that are routing:

- **Specialization**: Route to agents with domain-focused system prompts and tools, such as a security agent or a documentation agent, rather than loading a single agent with every capability[^S6]. This is the official phrasing for the `HANDLERS` table.
- **Escalation**: Consult a more capable agent or model for a subset of complex subtasks[^S6].

The second one deserves separate mention: it dispatches by **difficulty**, not **topic**. The classifier doesn't judge "is this refund or incident" but "can this email be handled by my cheap tier?" This is harder to judge accurately than topic classification, so the escalation path has a more stable writing: run the cheap tier first, if the output fails the gate then escalate—swap a hard-to-judge classification problem for a checkable verification problem.

## Knowing when not to split

**Each link in the chain adds latency.** This isn't an unoptimized implementation, it's the price the official definition sets: trading latency for higher accuracy[^S1]. The user waits for the sum of every segment. If the user is synchronously waiting in a UI for results, before adding another link to the chain, consider whether the person is still there.

**When there's only one category, routing is pure overhead.** Routing's benefit comes from separation of concerns[^S1]. If input really only has one type, you paid for a classification call's cost and latency and got nothing in return, plus one more chance to misclassify.

**When the task can't be cleanly split, don't force it.** The condition "easily and cleanly decomposed into fixed subtasks" has teeth[^S1]. A draft that needs to look at the whole picture back and forth to revise well, if you split it into "revise structure first, then revise wording," the second stage doesn't have access to the reasons the first stage didn't write down, and will only revise based on literal text. In this case one loop, one context is actually better—this is exactly the use of Lesson 1's reverse conditions.

**When unsure, measure first.** Anthropic said this twice: consider adding complexity only when it demonstrably improves outcomes[^S1]. The evaluation track from Course 10 in this series is built for this: run the single-prompt version and get a score, run the split version and get another score, see how much difference and whether it's worth those extra seconds of latency—that's the evidence you can take into an argument with a colleague.

Finally, mark the boundary. Chaining and routing are both **fixed-shape** orchestration: how many stages the chain has, which categories the router has, all decided when you write the code. Running multiple stages simultaneously and then aggregating is Lesson 3's parallelization; not even knowing how many subtasks there are until you see the input is Lesson 4's orchestrator-workers.

## 💻 Exercises

<!-- exercises -->

### Level 1: Decide chaining, routing, or neither (no code)

For each of the four tasks below, decide whether to use chaining, routing, both, or neither. Besides the conclusion, write clearly: if you judged chaining, what does the programmatic gate between stages check? If you judged routing, where does the classifier go, how many categories, is it a model or code?

1. Customer mailbox receives hundreds of emails daily, refund/incident/billing three categories have completely different handling, currently sharing one prompt, changing wording for one category affects another.
2. An English contract needs to first be reviewed for a structured risk opinion (each item contains clause location, risk level, explanation), then translate this opinion into Chinese and Japanese versions for different teams.
3. A mixed ticket queue: both "password reset" that can be answered in one step, and "data migration failed" that requires checking logs, diagnosing, proposing a solution, and writing a response—multi-step tasks.
4. User types a sentence in an input box, you need to fix the typos and return the corrected sentence.

<!-- rubric -->

- The four conclusions are: routing / chaining / both / neither.
- Task 1's reasoning must land on "optimizing for one kind of input can hurt performance on other inputs," and provide the category set, which must include a fallback category.
- Task 2 must point out that the two translation versions have no sequential dependency (parallelization is left for Lesson 3, recognizing it is enough), and provide at least one specific gate.
- Task 3 must explain the two-layer structure: outer layer routes by complexity, the branch judged complex internally becomes a chain.
- Task 4 must explicitly say "one call is enough," with reasoning landing on splitting's latency not being proportional to benefit.
- Every gate must be checkable by pure code, can't be "let the model see if it's acceptable."

<!-- answer -->

**1. Customer emails dispatched by topic — routing.**

The criteria exactly match the use case: distinct categories that are better handled separately, and classification itself can be handled accurately[^S1]. The sentence in the prompt "changing wording for one category affects another" is the live version of the official statement "without this workflow, optimizing for one kind of input can hurt performance on other inputs"[^S1]. Classifier goes at the front, category set is `refund / incident / billing / other`, with "other" catching emails that don't fit the first three and cases where the model doesn't respond in the expected format. One cheap model call, output tightened to one word. If most refund emails come from a fixed after-sales form entry point, that path can be short-circuited with a pure code rule first.

**2. Contract review producing structured opinion then translation — chaining.**

Task can be cleanly split into fixed subtasks: review, translate; the second step's input is the first step's output, which is exactly chaining's definition shape[^S1]. The two languages have no sequential dependency—this "same step repeated across multiple items" shape is Lesson 3 parallelization's territory, just need to recognize it and not write it as two serial stages.

Gate goes between review and translation, checking structure not content, all pure code: output can be `JSON.parse` parsed into an array; each item has three fields `clause`, `level`, `note`; `level` falls in the set `high / medium / low`; array length greater than 0 (a contract reviewed to zero opinions is more likely the previous step going off track, not a perfect contract). The translation stage can't discover that its input is bad, it'll just faithfully translate the bad thing into two languages, so this gate has to block it upstream.

**3. Mixed tickets — both.**

Outer routing, inner chaining. Classifier goes at the queue entrance, judging not topic but complexity, categories can be `one-step-answerable / needs-diagnosis / other`. "One-step-answerable" goes directly to one call or even a template; "needs-diagnosis" expands into a chain: check logs → diagnose cause → propose solution → write response. This is dispatch by difficulty, same category as the official vocabulary's escalation—that entry says consult a more capable agent or model for a subset of complex subtasks[^S6], here swapping "more capable agent" for expanding a chain.

Chain internals have at least two pure code gates: diagnosis stage's output must carry at least one log line reference (regex check timestamp format), write-response stage's output must contain the ticket number given by the solution stage (string inclusion check). If the complexity classifier itself is hard to get accurate, switch to "first handle as one-step-answerable, if output fails the gate then escalate."

**4. One-sentence typo correction — neither.**

One call is enough. There are no fixed subtasks that can be cleanly separated ("find errors" and "fix errors" done separately, the second stage still has to re-read the whole sentence, equivalent to running for nothing), and no categories that need separate handling. The cost of splitting is concrete: one more round trip of latency, and the user is staring at the input box waiting for results. Chaining's positioning is trading latency for accuracy[^S1], with the precondition that accuracy can actually be gained—this task can't gain it. To really improve quality, first add a few examples to the prompt; Anthropic also left this path before the patterns: for many applications, optimizing single LLM calls with retrieval and in-context examples is usually enough[^S1].

<!-- hint -->

Before rushing to judge patterns, first ask each task two questions: is what comes in "one thing" or "several kinds of things"? If it's one thing, can it be split into steps that are each simpler and in a fixed order? First question answers "several kinds of things" then think routing, second question answers "yes" then think chaining.

<!-- hint -->

When writing gates, self-check: can you write this check with `if` and string functions, and does the same input always get the same conclusion? If you're writing it and it turns into "let the model judge if this outline is good enough," then it's not the programmatic check this lesson talks about—that's a review loop, left for Lesson 5.

### Level 2: Write out the three-stage chain and make it run (write code)

Write a `chain.mjs` that implements the opening doc-writing task as a three-stage chain: **draft outline → write full text based on outline → check terminology consistency**, with two gates in between. Requirements:

1. Use stub client (the approach used in Courses 8-11 in this series): a fixed response queue, no network, no cost, same input always produces same result.
2. `runAgent(client, task, tools)` is a real harness loop—judging by `stop_reason`, if `tool_use` then execute tool and send result back. Stage three should actually go through one tool call (read glossary).
3. Gate 1: outline must contain exactly 3 chapter headings starting with `## `. Gate 2: full text must not contain banned deprecated terms (define your own table of two or three words). Both are pure code, no more model calls.
4. When a gate fails, print which **stage** it failed at and why, then exit with non-zero code; if all three stages pass then exit with 0.
5. Prepare two sets of fixed responses and run twice: once passing all, once stopped by the second gate. Paste both runs' actual output and exit codes.

<!-- rubric -->

- Stub client is a FIFO response queue, when queue is empty must error rather than silently returning `undefined` (otherwise you think the chain ran through but it actually spun empty).
- `runAgent` has a real `while` loop and `stop_reason` branches, not returning after one `await`; stage three's response sequence contains a `tool_use`, so the tool branch actually executes.
- Both gate functions don't call client, return value carries failure reason, same input always same output.
- Failure message writes out which two stages it's between and specifically which word was hit—just printing "failed" doesn't count.
- Exit code: all pass 0, gate fail non-zero (parameter errors etc. can give a different non-zero code).
- Second response set triggers gate 2, and stage three truly didn't run (output shows no print from it).
- Pasted output is actually run: stage numbers, hit words, exit codes all match the script.

<!-- answer -->

Complete script:

```javascript
// chain.mjs — three-stage chain: draft outline → write doc → check terms
// This lesson's own illustrative script—no orchestration script code samples in primary sources
// Usage: node chain.mjs pass    (all three stages pass)
//        node chain.mjs stale   (stopped by second gate)

const BANNED = ['user groups', 'sub-accounts'];

// ---------- Stub client: fixed response queue, no network ----------
const say = (t) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] });
const useTool = (id, name, input = {}) => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id, name, input }],
});

function makeStubClient(script) {
  const queue = [...script];
  return {
    messages: {
      async create() {
        if (queue.length === 0) throw new Error('Stub queue empty: script called model more times than preset');
        return queue.shift();
      },
    },
  };
}

// ---------- One stage = one complete harness loop ----------
async function runAgent(client, task, tools = {}) {
  const messages = [{ role: 'user', content: task }];
  while (true) {
    const res = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      messages,
      tools: Object.values(tools).map((t) => t.schema),
    });
    messages.push({ role: 'assistant', content: res.content });

    if (res.stop_reason !== 'tool_use') {
      return res.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
    }

    const results = [];
    for (const block of res.content) {
      if (block.type !== 'tool_use') continue;
      const tool = tools[block.name];
      results.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: tool ? await tool.run(block.input) : `Unknown tool: ${block.name}`,
      });
    }
    messages.push({ role: 'user', content: results });
  }
}

// ---------- Two gates: pure code, don't ask model ----------
function gateOutline(outline) {
  const headings = outline.split('\n').filter((l) => l.startsWith('## '));
  if (headings.length !== 3) {
    return { ok: false, why: `Outline requires exactly 3 chapter headings, actually counted ${headings.length}` };
  }
  return { ok: true, detail: `Chapters: ${headings.map((h) => h.slice(3)).join(' / ')}` };
}

function gateTerms(doc) {
  const hits = BANNED.filter((w) => doc.includes(w));
  if (hits.length > 0) {
    return { ok: false, why: `Document contains banned deprecated terms: ${hits.join(', ')}` };
  }
  return { ok: true, detail: `Banned term list ${BANNED.length} items, hit 0` };
}

function fail(where, why) {
  console.error(`\n✗ gate failed @ ${where}`);
  console.error(`  Reason: ${why}`);
  console.error('  Chain stops here, later stages will not run.');
  process.exit(1);
}

// ---------- Tools ----------
const glossary = {
  schema: {
    name: 'read_glossary',
    description: 'Read product terminology glossary, returns "old term → new term" mapping',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  run: async () => 'user groups → team spaces\nsub-accounts → member accounts\napproval flow → workflow',
};

// ---------- Three sets of fixed responses ----------
const OUTLINE = ['## Permission Model', '## Establishing Team Spaces and Member Management', '## FAQ'].join('\n');

const CLEAN_DOC = [
  '## Permission Model',
  'Each member account belongs to a team space, permissions are determined by the team space role.',
  '## Establishing Team Spaces and Member Management',
  'After the admin creates a team space in the console, they can invite member accounts to join.',
  '## FAQ',
  'Member accounts can belong to multiple team spaces simultaneously, permissions are unioned.',
].join('\n');

const STALE_DOC = CLEAN_DOC.replace('invite member accounts to join', 'invite sub-accounts to join');

const REPORT = 'Terminology consistency check passed: full text uniformly uses "team spaces" and "member accounts," no deprecated terms mixed in.';

const SCRIPTS = {
  pass: [say(OUTLINE), say(CLEAN_DOC), useTool('t1', 'read_glossary'), say(REPORT)],
  stale: [say(OUTLINE), say(STALE_DOC)],
};

// ---------- Chain body ----------
const mode = process.argv[2] ?? 'pass';
if (!SCRIPTS[mode]) {
  console.error(`Unknown mode: ${mode} (available: ${Object.keys(SCRIPTS).join(', ')})`);
  process.exit(2);
}
const client = makeStubClient(SCRIPTS[mode]);
const req = 'Write help documentation for the "Team Spaces" feature, readers are admins configuring permissions for the first time.';

console.log(`Mode: ${mode}`);

console.log('[1/3] Draft outline');
const outline = await runAgent(client, [
  'Goal: Draft a help documentation outline for the requirements below.',
  'Output format: Only output chapter titles, one per line, starting with "## ", exactly 3.',
  'Tool guidance: This stage does not need tools.',
  'Boundaries: Only list titles, do not write body text.',
  `Requirements: ${req}`,
].join('\n'));
const g1 = gateOutline(outline);
console.log(g1.ok ? `      gate 1 passed — ${g1.detail}` : '      gate 1 failed');
if (!g1.ok) fail('stage 1 → stage 2 (outline structure)', g1.why);

console.log('[2/3] Write doc based on outline');
const doc = await runAgent(client, [
  'Goal: Write help documentation body text based on the outline below.',
  'Output format: Keep the "## " titles from the outline, write 1-2 sentences per section.',
  'Tool guidance: This stage does not need tools.',
  `Boundaries: Only use new terms, banned: ${BANNED.join(', ')}.`,
  `Outline:\n${outline}`,
].join('\n'));
const g2 = gateTerms(doc);
console.log(g2.ok ? `      gate 2 passed — ${g2.detail}` : '      gate 2 failed');
if (!g2.ok) fail('stage 2 → stage 3 (banned deprecated terms)', g2.why);

console.log('[3/3] Check terminology consistency');
const report = await runAgent(
  client,
  [
    'Goal: Check if the terminology in the document below is consistent.',
    'Output format: One-sentence conclusion.',
    'Tool guidance: First call read_glossary to get the term table, then check against the full text.',
    'Boundaries: Only report terminology issues, do not rewrite the document.',
    `Document:\n${doc}`,
  ].join('\n'),
  { read_glossary: glossary },
);

console.log(`\n--- Check conclusion ---\n${report}`);
console.log('\n✓ Three stages, two gates all passed.');
process.exit(0);
```

First run, all three stages pass (Node v26.3.0):

```text
$ node chain.mjs pass
Mode: pass
[1/3] Draft outline
      gate 1 passed — Chapters: Permission Model / Establishing Team Spaces and Member Management / FAQ
[2/3] Write doc based on outline
      gate 2 passed — Banned term list 2 items, hit 0
[3/3] Check terminology consistency

--- Check conclusion ---
Terminology consistency check passed: full text uniformly uses "team spaces" and "member accounts," no deprecated terms mixed in.

✓ Three stages, two gates all passed.
$ echo $?
0
```

Second run, writing stage produced text with deprecated terms, stopped by gate 2:

```text
$ node chain.mjs stale
Mode: stale
[1/3] Draft outline
      gate 1 passed — Chapters: Permission Model / Establishing Team Spaces and Member Management / FAQ
[2/3] Write doc based on outline
      gate 2 failed

✗ gate failed @ stage 2 → stage 3 (banned deprecated terms)
  Reason: Document contains banned deprecated terms: sub-accounts
  Chain stops here, later stages will not run.
$ echo $?
1
```

Three things worth looking at against the output: the second run has no `[3/3]` line, stage three truly didn't run, bad stuff didn't flow downstream; failure message pinpoints "stage 2 → stage 3" and the specific word "sub-accounts," so you know to go fix the writing stage's prompt; the `stale` queue only has two responses—if gate 2 gets mistakenly deleted someday, the script will walk into stage three, can't get a response, stub client throws "Stub queue empty"—the failure mode is loud, not silent. Calculate the bill by the way: the `pass` run actually called the model four times—stage three checking terms went through one tool round trip, stage count is three, round trip count is four, cost should be calculated by round trip count.

<!-- hint -->

Get stub client and `runAgent` working separately before connecting the chain. Use a queue containing only one `say(...)` to run one stage, confirm it returns text not `undefined`; verify the tool branch separately: let the queue's first response stop at `tool_use`, second one is the closing text, the loop should turn exactly twice.

<!-- hint -->

"Which stage failed" should be passed as a parameter into `fail()` when you write it, don't expect to see it from the stack afterward. Give each gate fixed "stage X → stage Y" wording, print it along with the specific hit word when it fails. Use `process.exit(1)` for exit code, don't just `throw`—what `throw` produces is indeed exit code 1, but the stack info will cover the few lines you carefully printed.

<!-- /exercises -->

## Recap

- Chaining decomposes a task into a sequence of steps where each call processes the previous output, making each call an easier task[^S1]; it's priced explicitly: the main goal is to trade off latency for higher accuracy[^S1].
- A stage in the chain is a complete harness loop, not one API call—the setup Anthropic recommended for evaluation is exactly this building block: one task, one while loop, code directly calling API[^S3].
- The positions added after splitting are the key: you can add programmatic checks on any intermediate steps to ensure that the process is still on track[^S1]. This is Course 10's deterministic verifier moved from a different installation location—from terminal state to between stages; in product form it looks like subagents executing sequentially, each completes then the upper layer passes relevant context to the next[^S4].
- Routing classifies input and dispatches to specialized followup tasks, gaining separation of concerns and more specialized prompts; without it, optimizing for one kind of input can hurt performance on other inputs[^S1]. Precondition: clear categories and classification itself can be handled accurately, either LLM or traditional classification algorithms[^S1].
- Tighten the classification call's output to one label, and leave one fallback branch to catch answers that don't fit the table.
- This pattern is alive in current first-party vocabulary: dispatching by domain to agents with dedicated prompts and tools is called specialization, consulting a more capable agent or model for a subset of complex subtasks is called escalation[^S6]—the latter is routing dispatching by difficulty.
- Don't force it: when there's only one category routing is pure overhead, when the task can't be cleanly split forcing it will lose information between stages[^S1]. When unsure, measure first—complexity has to pass the "demonstrably improves outcomes" threshold[^S1].

[>> Lesson 3: Parallelization: Sectioning and Voting](./03-parallelization.md)
