# Lesson 5: Intervention and Steering: Interrupt, Redirect, Human-in-the-Loop

> Learning goals:
> - Say why an autonomous loop needs a human in it, and make the causal link plain: excessive agency is why a more autonomous loop needs more of a manual gate
> - Tell interrupt, steer, and approve apart — where each one cuts into the loop, and what each one changes
> - Decide whether a human approval point for a high-impact action belongs before or after execution, and state the "before it becomes irreversible" rule
>
> Prerequisites: Finish Lessons 3 and 4, know that a loop has stop conditions and that dead loops and idle spinning need fallbacks, and understand the harness as the control code around the model | Previous: [Lesson 4 <<](./04-loop-failure-modes.md) | Next: [Lesson 6 >>](./06-build-a-harness.md)

## The First Four Lessons Managed the Loop Itself; This One Puts a Person In

By now the loop in your hands runs, stops, and has fallbacks under it. Lesson 3 gave it explicit stop conditions. Lesson 4 taught it to recognize dead loops and idle spinning so it doesn't burn the budget to the ground. Those controls all share something: they're the harness wrestling with the loop on its own, start to finish, with nobody stepping in.

Real agents rarely run all the way through unattended. Halfway into a task you might want to call the whole thing off — the direction is flat wrong, stop spending. You might want to change the goal without stopping the process: "drop the refactor, go find and fix that production bug first." Or one particular step is dangerous enough that you want to look at it and nod before it happens. The model can't decide any of these on its own, and the automated stopping and fallbacks from Lessons 3 and 4 don't reach them either — these are things a **person** reaches in from outside the loop to do. This lesson is that layer: how a human intervenes mid-loop, and where the code for that intervention belongs.

## The More Autonomous the Loop, the More It Needs a Human Gate

Settle one question first: after all that work getting the loop to run itself, why put a person back in?

The answer hides on the other side of the word "autonomous." An agent is a system where the model decides for itself, inside a loop, what to do next and which tool to use. That autonomy is exactly what makes it useful — and exactly what makes it dangerous. The security community has a name for the risk: excessive agency. OWASP puts it this way: "Excessive Agency is the vulnerability that enables damaging actions to be performed in response to unexpected, ambiguous, or manipulated outputs from an LLM, regardless of what is causing the LLM to malfunction."[^S4]

Lay that sentence over the loop and it turns concrete. On any given turn the model might misread what a tool returned, might take a vague sentence from the user the wrong way, might get dragged off course by a malicious instruction buried in a web page it reads. The runaway modes in Lesson 4 broke the loop's *rhythm* — it wouldn't stop, it spun in place. What breaks here is the loop's *action*: it went and actually did something it shouldn't have. And the more permission and autonomy the loop carries, the more damage a single bad judgment does. So alongside the harness's own automatic gates — stop conditions, fallbacks — the handful of points where a mistake can't be taken back need one more gate, a **human** one, giving a person the chance to say "hold on" before the action lands.

This isn't distrust of automation. It's an admission. The model may run for a long stretch of turns, and as Anthropic's guidance says, "The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making."[^S1] Trust isn't the same as a free hand the whole way, though. Trust is what lets it walk most of the steps by itself; the human gate guards the few intersections where the wrong turn can't be undone.

## Three Kinds of Intervention: Interrupt, Steer, Approve

Reaching into a loop isn't only ever "make it stop." Sorted by what the loop does afterward, there are three moves, each cutting in at a different point and changing something different.

**Interrupt — call off the whole loop.** The bluntest of the three: whatever the model wants to do this turn, the loop terminates and no further request goes out. It resembles Lesson 3's stop conditions; the difference is who pulls the trigger. A stop condition is the harness pulling back on its own by a preset rule. An interrupt is a person outside the loop hitting stop by hand. You use it once you can see the direction is entirely wrong and continuing only burns tokens. After an interrupt the loop is over — there's no "and then."

**Steer — change the goal or hand it new instructions, then let it keep running.** This one doesn't terminate anything. It pushes a fresh human message into the conversation, changing what the model leans into next, and the loop carries that instruction forward. Say the agent is grinding through a refactor of some module and you spot a more urgent production bug. Without restarting the process, you can drop in: "pause the refactor, first track down and fix that 500 on the login endpoint." Steering changes the loop's *goal*, not whether the loop lives.

**Approve — green-light a single step; no nod, no action.** The first two act on the whole loop. Approval acts on one specific action: the loop reaches a high-impact operation, stops, lays out "here's what I'm about to do," and executes only if a person says yes — skipping or canceling if they say no. It's really just a very disciplined kind of pause: "Agents can then pause for human feedback at checkpoints or when encountering blockers."[^S1] Approval is that checkpoint, pinned precisely in front of the dangerous actions. Once approval clears, the loop returns to its normal rhythm. It's also the most routine of the three, and the one best suited to being left switched on permanently.

One line to keep them straight: an interrupt decides whether the loop **lives**, steering decides where the loop **points**, approval decides whether **one action** goes through. Lesson 6's minimal harness is where approval actually gets written into code.

## Writing the Approval Valve Into the Loop: Stop Before the Action Lands

Of the three, approval is the one that most needs to live in harness code. Interrupt and steer can usually be triggered by a person typing something in a terminal; approval has to be the harness actively stopping at the right spot and waiting. Leave it out and the loop simply does the dangerous thing.

One of OWASP's mitigations for excessive agency reads: "Utilise human-in-the-loop control to require a human to approve high-impact actions before they are taken."[^S4] Watch the ordering in that sentence — approve **before** they are taken. Approve first, execute second; not execute first and collect a signature after. Where the valve physically goes, the standard leaves wide open: "This may be implemented in a downstream system (outside the scope of the LLM application) or within the LLM extension itself."[^S4] Dropped onto our loop, the natural home is tool dispatch — a pause inserted right before any tool marked high-impact actually gets called.

In code, it's a fork placed in front of the line that runs the tool:

```javascript
// Inside the loop body, after you have this turn's tool_use blocks and before anything executes
for (const block of toolUseBlocks) {
  if (isHighImpact(block.name)) {
    // Lay out what it intends to do: tool name + arguments
    const decision = await askHuman(block.name, block.input);
    if (decision !== "approve") {
      // No nod: don't execute. Send "denied" back as a tool_result so the model rethinks
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: "A human denied this operation. Do not retry it; find another way.",
        is_error: true,
      });
      continue; // The key line: skip the real execution below
    }
  }
  // Low-impact, or already approved: run it as usual
  const output = await executeTool(block.name, block.input);
  results.push({ type: "tool_result", tool_use_id: block.id, content: output });
}
```

Three spots deserve a look. First, the check sits **before** `executeTool` — the pause has to happen before the action lands, so that while you're waiting on a human, the dangerous operation still hasn't run. Second, a denial isn't a silent skip; it returns a `tool_result` with `is_error` set (remember that field from Lesson 2?), so the model learns that this path is blocked and goes looking for another approach instead of proposing the identical action again next turn. Third, `isHighImpact` only stops the high-impact operations — reading a file, checking a log, and other harmless moves go through untouched. Otherwise every single step needs a human nod and the agent degrades into an expensive manual tool.

```agentmentor-check
{
  "id": "harness-zh-05-approve-before-not-after",
  "label": "Decide which side of a destructive operation the human approval point belongs on",
  "prompt": "Your ops agent has a drop_table tool that drops tables on the production database. A colleague suggests: let the loop execute automatically as usual, and just record which table was dropped in an audit log after each run, plus fire a notification so a human can review it. That way you get a record and you don't slow the loop down. Does this \"log it and notify afterward\" design do the job human-in-the-loop approval is supposed to do?",
  "whyHere": "The section just established that the approval valve must stop before the action lands (approve before it is taken), and \"logging and notifying after the fact also counts as putting a human in the loop\" is the closest look-alike and the easiest self-deception to fall for — it has to be caught right here, because it mistakes traceability for interception.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Yes. With an audit log and a notification, a person can always see what the agent did — the human is in the loop, so approval has done its job.",
      "correct": false,
      "feedback": "That mistakes after-the-fact traceability for before-the-fact interception. Approval exists to keep a destructive action from happening at all, and by the time this notification goes out, drop_table has already run against production — the table is gone, and reviewing it only confirms the loss. Logs and notifications are worth having, but they solve \"we can find out what happened,\" not \"we can stop it from happening.\""
    },
    {
      "id": "b",
      "text": "No. Approval has to sit before drop_table runs, with the nod coming first; an after-the-fact record gives traceability, not interception.",
      "correct": true,
      "feedback": "Right. The ordering is what makes human-in-the-loop approval work: approve first, execute second, with the pause landing at the moment the action can still be called off. An irreversible operation like drop_table can't be taken back once it completes, so a gate placed after execution is a gate in name only. The working version stops before drop_table is called, shows the human which table is about to go, continues only on an explicit approval, and on a denial skips execution and hands the refusal back to the model so it finds another route."
    },
    {
      "id": "c",
      "text": "Yes, as long as the notification is fast enough — a person can manually restore the table right after the drop, so the effect works out the same.",
      "correct": false,
      "feedback": "That leans on luck and on an undo button that may not exist. Whether drop_table is reversible depends on whether a usable backup exists and whether it can be restored in time, and plenty of irreversible operations have no \"delete then restore\" path at all. The whole point of approval is not gambling on that — hold the irreversible action back before it executes and you don't have to hope a fix is available afterward."
    }
  ]
}
```

## Where the Gate Goes: Before the Action Becomes Irreversible, Not After

That approval valve works entirely because it stands in the right place. This section pulls that placement rule out on its own, because it's the thing in this lesson most easily remembered backward — and the most costly to get backward.

The rule in one sentence: **the approval pause goes before the action becomes irreversible, not after.** You've met this idea already in the earlier course "Agent Tool Calling: Getting Agents to Actually Do Things" — the bigger an action's blast radius and the less it can be taken back, the earlier its confirmation point has to sit. Here's how it lands on the loop: the check goes on the line above `executeTool`, so during the wait for a human the destructive action hasn't happened yet. Move it below, and by the time you react the table is dropped, the email has gone out to everybody, the production config is already changed — and however precise the logging is, all it's done is take a picture of the wreckage.

How do you spot "irreversible"? Give yourself a counterfactual test: if this action runs and it's wrong, can I undo it in one step? Things that roll back cheaply — writing a scratch file, saving an internal draft — need no gate, or a very loose one. Things you can't take back, or can only take back at enormous cost — dropping a database, moving money, publishing externally, changing production config — need the gate early, and need it to be "approved first, then done." That also joins up neatly with Lesson 4: that lesson was about keeping the loop from burning through resources, this one is about keeping the loop from doing something that can't be recalled. The first is a rhythm going out of control, the second is an action going out of control, and both need their gate set before "too late" arrives.

One detail people routinely miss: the gate belongs at the step closest to where the action actually lands. Suppose dropping the table passes through several hands — model proposes, harness dispatches, `drop_table` gets called. It's not enough to put approval at the "model proposes" step, because the proposal itself does no damage whatsoever. As Lesson 1 said, "The model never executes anything on its own."[^S2] The damage lives in that final `executeTool` call. Push the gate as far toward the execution end as you can, and the model can change its mind and rework its arguments as many times as it likes — all of it still on this side of the gate, where nobody gets hurt.

## How Lesson 6 Folds All Three Into One Loop

Line this lesson up against the previous ones and the harness's set of controls is complete: Lesson 3's **stop conditions** (pull back automatically when it's time), Lesson 4's **runaway fallbacks** (spot dead loops and idle spinning, don't burn through the budget), and this lesson's **human-in-the-loop approval** (a manual gate before dangerous actions land). They aren't a pick-one-of-three. They're three layers stacked on the same loop — stop conditions govern how long it runs, fallbacks govern what happens when it runs off course, approval governs whether this particular move gets to happen at all.

Lesson 6 welds all three into one runnable minimal harness: a while loop with a turn cap, idle-spin detection, and an approval valve on high-impact operations. You'll see there how this lesson's `isHighImpact` fork, Lesson 3's counter, and Lesson 4's progress check each take their own position inside a single loop body without fighting each other. For this lesson, holding onto two things is enough: what each of the three interventions changes, and that the approval gate has to stand before the point of no return.

<!-- exercises -->
## 💻 Exercises

### Level 1: Label Three Intervention Moves

A deployment agent is automatically running a "build → test → release to production" pipeline. Below are three things the on-call engineer does at different moments. For each, decide whether it's an **interrupt**, a **steer**, or an **approval**, and say why (did it terminate the loop, change the loop's goal, or green-light one action?).

1. The agent stops just before the "release to production" step. A prompt appears on screen: "About to release v2.3.1 to production. Confirm?" The engineer glances at the version number, clicks "Confirm," and the agent proceeds with the release.
2. The agent keeps retrying a test that fails every time. The engineer decides this path goes nowhere, hits stop, and the whole pipeline terminates and the process exits.
3. The agent is still running tests when the engineer drops in a message: "Don't ship 2.3.1 — the customer wants 2.3.0, switch to that version and continue." The agent carries on with the new version number.

<!-- rubric -->
- The three are correctly labeled approval, interrupt, and steer
- Each judgment lands on the dividing line: does it change one action, the loop's survival, or the loop's direction
- Identifies that the key to item 1 is "the pause happens before the high-impact release action executes, and it waits for a human nod before continuing"

<!-- answer -->
1. **Approval.** The loop didn't terminate and the goal didn't change; the engineer only green-lit one high-impact action, "release to production." The ordering is what matters: the pause happens before the release actually executes, and it continues only once "Confirm" comes back — that's exactly what human-in-the-loop approval's "approve first, execute second" looks like.
2. **Interrupt.** What the engineer acted on is whether the loop lives: the entire pipeline is called off and the process exits, with no "and then." It resembles a stop condition, but the trigger is a person outside the loop hitting stop by hand, not the harness pulling back automatically by a preset rule.
3. **Steer.** The loop never stopped. The engineer pushed a new instruction into the conversation, changing what the loop leans into next (a different version number), and the agent carried the new goal forward. That's direction, not survival, and not the green-lighting of a single step.

<!-- hint -->
Ask one question first: after this happened, is the loop still running? If it's fully stopped, that's an interrupt. If it's still running, look at whether what changed was "the loop's overall goal" or "whether one specific action should happen."

<!-- hint -->
Items 1 and 2 both cluster around release and testing, which makes them easy to blur. The difference is the outcome: one lets the loop continue after green-lighting a step (approval), the other ends the loop outright (interrupt).

### Level 2: Put the Approval Valve in the Right Place

The loop body below is trying to add human approval to an agent that can send external email, but the way it's written has a problem: the email is already sent by the time the human gets asked. Point out what's wrong with the placement, what it leads to, and move the approval valve to the correct position.

```javascript
for (const block of toolUseBlocks) {
  const output = await executeTool(block.name, block.input);
  results.push({ type: "tool_result", tool_use_id: block.id, content: output });

  if (block.name === "send_external_email") {
    const decision = await askHuman(block.name, block.input);
    if (decision !== "approve") {
      console.log("A human did not approve this email"); // but the email already went out
    }
  }
}
```

<!-- rubric -->
- Pinpoints the root problem: `askHuman` appears after `executeTool`, so the email goes out before the human is asked, turning approval into an after-the-fact record that stops nothing
- Explains the consequence: `send_external_email` is an irreversible external action, so even a "no" afterward can't take it back and the gate is a gate in name only
- The fix moves the whole "is this high-impact + wait for approval" block ahead of `executeTool`, skips execution when not approved, and returns the denial to the model (for instance as a tool_result with `is_error`)

<!-- answer -->
The root problem: **the approval valve stands after `executeTool`.** The code runs the tool unconditionally — at which point the email is already out — and only then asks a human. So all `askHuman` does is record someone's opinion after the fact. `send_external_email` is an irreversible external action; once the mail is gone it can't be recalled, and a "no" only confirms an incident that already happened. A gate placed after the action lands is the same as no gate.

Correcting it: move the whole "check high-impact + wait for approval" block ahead of execution, skip execution when it isn't approved, and hand the denial back to the model so it takes another route.

```javascript
for (const block of toolUseBlocks) {
  if (block.name === "send_external_email") {
    const decision = await askHuman(block.name, block.input); // ask before sending
    if (decision !== "approve") {
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: "A human denied this email; it was not sent. Do not retry; handle it another way.",
        is_error: true,
      });
      continue; // The key line: skip the real execution below, so the email never goes out
    }
  }
  const output = await executeTool(block.name, block.input); // only low-impact or approved calls reach here
  results.push({ type: "tool_result", tool_use_id: block.id, content: output });
}
```

Now the pause happens before the email actually goes out: it sends on a nod, and on a refusal it never sends at all, while the model learns that this path is blocked.

<!-- hint -->
Watch the order of two lines: `executeTool` (actually sends the mail) and `askHuman` (asks a person). Which one runs first right now? Human-in-the-loop approval requires "approve first, execute second" — check whether the order is inverted.

<!-- hint -->
Flipping the order isn't quite enough on its own — when approval doesn't come through, the tool must genuinely **not run** (use `continue` to skip it), and it's best to return the denial to the model as a `tool_result` with `is_error`, or it may well propose the same email again next turn.

<!-- /exercises -->

## Recap

- The more autonomous the loop, the more it needs a human gate at the critical points: excessive agency means unexpected, ambiguous, or manipulated model output can trigger damaging actions that can't be taken back[^S4]; trusting a model that may operate for many turns[^S1] isn't the same as a free hand, and the human gate guards the few intersections where a wrong turn can't be undone
- The three interventions each govern a different layer: **interrupt** acts on whether the loop lives (a person calls the whole loop off from outside), **steer** acts on where it points (push in a new instruction, change the goal, keep running), **approve** acts on whether one action goes through (pause before a dangerous operation and wait for a nod); the last of those is exactly the "pause for human feedback at checkpoints"[^S1] idea pinned in front of high-impact actions
- The hard rule of human-in-the-loop approval is approve first, execute second: high-impact actions require a human to approve them before they are taken[^S4], and the valve can live in a downstream system or inside the agent extension itself[^S4]
- The gate goes before the action becomes irreversible, not after: sitting above `executeTool`, the destructive action still hasn't happened while you wait on a human; moved below execution, even the most precise log is after-the-fact tracing and stops nothing that already landed. Use the counterfactual test to spot "irreversible" — if it runs wrong, can I undo it in one step?
- This lesson's approval, Lesson 3's stop conditions, and Lesson 4's runaway fallbacks are three layers stacked on the same loop, and Lesson 6 welds them together into a runnable minimal harness

[Lesson 6 >>](./06-build-a-harness.md)
