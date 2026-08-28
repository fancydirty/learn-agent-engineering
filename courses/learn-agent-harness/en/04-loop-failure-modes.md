# Lesson 4: Runaway and Fallback: Dead Loops, Idle Spinning, Budget Burnout

> Learning goals:
> - Recognize the four typical shapes of a runaway loop — compounding errors, context bloat and rot, dead loops and idle spinning, budget burnout — and say which property of the loop is causing each one
> - Attach the matching fallback gate to each one: checkpoints plus early stopping, context governance, a max-turn cap plus no-progress detection, a budget ceiling — and explain what each gate actually catches
> - Decide which hard gate a loop that's "spinning in place" needs, instead of trying to rescue a boundary-less loop by swapping models or rewriting the prompt
>
> Prerequisites: You've read Lessons 2 and 3, and you have a skeleton loop driven by `stop_reason` with a max-turn cap | Prev: [Lesson 3 <<](./03-stop-conditions.md) | Next: [Lesson 5 >>](./05-intervention-and-steering.md)

## A Loop That Runs Can Also Run Away

The last two lessons got your loop standing up: `stop_reason` as the while condition, then the explicit stop conditions from Lesson 3 so you can hold it down when the model refuses to wrap up. That sounds like a reasonably stable loop by now. But "I can hold it down" is only the final fuse, and it catches exactly one disease: a loop that won't stop. Loops go wrong in more ways than that, and most of the time nothing dramatic happens — the process isn't hung, the CPU isn't pegged. The loop just quietly, turn after turn, does the job wrong.

This lesson breaks the vague phrase "runaway loop" into four shapes you can actually name on sight: **compounding errors, context bloat and rot, dead loops and idle spinning, budget burnout**. They all trace back to the same root — an agent is a system that decides its own next step, and that autonomy is both why it's useful and why it goes off the rails. Anthropic puts it bluntly: "The autonomous nature of agents means higher costs, and the potential for compounding errors."[^S1] And "The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making."[^S1] Trust isn't the same as a free hand. This lesson is about what you owe the loop beyond trust: a fallback gate for each way it can run away.

One thing to settle up front, so you don't read the rest of this wrong: these four aren't low-probability accidents. They're tendencies baked into the loop as a structure. Leave a loop alone and it slides in these directions by default. So the fallbacks aren't patches you apply after an incident — they're railings you weld on from the start. One at a time.

## Runaway 1: Compounding Errors — One Wrong Step Poisons Every Step After

Start with the sneakiest one, because it never throws an error. Think back to the on-call bot from Lesson 2: restart the service, read the logs, report. Those three steps are chained — step two depends on step one's result, step three on step two's. Now suppose step one goes quietly wrong: the model reads the service name as `api-staging` and restarts the pre-production environment instead. The tool says "restart successful" and the model takes that at face value. It then reads the logs, sees no new errors, and cheerfully reports "restart complete, logs are clean." Every tool call succeeded. Not one exception was raised. And yet from step two onward the whole thing was built on a wrong foundation, drifting further with each step.

That's **compounding errors**: an agent running autonomously means mistakes accumulate and amplify around the loop[^S1]. It isn't the same animal as the "buggy code causes an infinite loop" case from Lesson 2 — that's a mechanical fault you can spot at a glance. Compounding errors happen at the decision layer, where each individual step looks perfectly reasonable and the mistake grows at compound interest down the chain. The more turns the loop runs and the longer the chain gets, the harder it is to predict how far an early nudge will have carried things by the end.

The fallback takes two pieces working together. First, **checkpoints**: pause at the links in the chain where "if this is wrong, everything after it is wasted," and make the loop surface its intermediate state for verification. Anthropic describes this kind of pause directly — "Agents can then pause for human feedback at checkpoints or when encountering blockers."[^S1] Lesson 5 covers how to design that pause point. Second, **early stopping**: rather than let an already-drifting loop burn through its whole budget, stop it the moment something looks off. That's exactly what the explicit stop conditions from Lesson 3 are for, and it echoes the general advice that "it's also common to include stopping conditions (such as a maximum number of iterations) to maintain control."[^S1] The core idea: since errors accumulate with turn count, don't let the loop run a long chain unverified.

## Runaway 2: Context Bloat and Rot — History Gets Heavier Every Turn

Lesson 2 planted a debt: every trip around the loop, that `messages.push` line stuffs two more messages into the history, add-only, never subtract. Back then we said "we'll settle up later." This is later.

Take "bloat" first. "An agent running in a loop generates more and more data that could be relevant for the next turn of inference,"[^S3] and every turn that data gets carried into the next request unchanged. For a task that runs three or five turns, who cares. But once a loop needs dozens of turns, the history snowballs — every single request is hauling a longer and longer context around, so requests get slower and more expensive. That's the immediate, visible cost.

"Rot" is the nastier half, because it damages quality and not just the bill. "LLMs have an 'attention budget' that they draw on when parsing large volumes of context," and "Every new token introduced depletes this budget by some amount."[^S3] The consequence is that "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases."[^S3] This is what people usually mean by context rot — nothing got deleted from the history, but the key facts are drowning in noise, so the model can see them without being able to grab them. The longer the loop runs, the looser its grip on that one critical instruction or constraint from turn two, and the easier it is for behavior to drift.

There's a matter of scale you have to get right here, or you'll defend against the wrong thing: this degradation is a performance curve that slopes down gently with length, not a cliff you fall off past some threshold — "These factors create a performance gradient rather than a hard cliff."[^S3] Don't read it as "once the context is too big, everything is ruined." It's more like water rising and the hull settling: you can still sail at any water level, it just gets harder. Accepting that is what gets you to the right posture — "context, therefore, must be treated as a finite resource with diminishing marginal returns,"[^S3] and every chunk of history you add should have to answer "is this still worth it?"

The fallback is **context governance**: actively manage the history the loop produces instead of blindly pushing to it. The specific techniques — compacting old turns, summarizing early results, dropping intermediate artifacts that no longer matter — are the whole subject of Course 5 in this series, "Agent Memory and State," so we won't reopen them here. What you need to take away from the loop's point of view is this: governing context is how you put a brake on the loop's per-turn cost, so a loop that runs long doesn't get progressively dumber as it goes.

## Runaway 3: Dead Loops and Idle Spinning — Going Nowhere, Never Stopping

In the first two failure modes the loop is at least moving forward, just crookedly or sluggishly. This one is blunter: the loop isn't moving forward at all, and it isn't stopping either. It wears two faces.

One is the **dead loop**, which you already met in Lesson 2's Level 2 exercise — the bottom of the loop body forgot to reassign `response`, so `stop_reason` stays frozen at its old value, the while condition is permanently true, the process hangs, and the same tool gets called over and over. This is a pure mechanical fault in the code: the host code is wrong, the model's decisions have nothing to do with it, and adding the missing re-request line fixes it.

The other face is sneakier and it's called **idle spinning** (also known as a livelock): the code is entirely correct, every turn legitimately sends a request, runs a tool, and reads a fresh `stop_reason` — and yet nothing new ever gets accomplished. The classic shape: the model calls the same search tool again and again, gets back near-identical empty results every time, doesn't change its approach, and searches for the same thing next turn. Judged by `stop_reason`, this loop looks perfectly healthy — always `tool_use`, always turning over normally. Judged by the task, it's marching in place, burning turns and tokens in circles and advancing nothing.

A dead loop is fixed by fixing the code. Idle spinning isn't — the code is fine, and there's no bug to fix your way out of. Idle spinning takes two hard gates:

- **Max-turn cap** (the gate from Lesson 3): give the loop an absolute ceiling on iterations, and stop at the ceiling no matter how "healthy" the turns look. This is the last fuse, guaranteeing that however hard the loop spins in place, it can't spin past N turns.
- **No-progress detection**: the gate built specifically for idle spinning. The idea is to have the host watch whether anything new is actually happening — record the names and results of the last few tool calls, and if N turns in a row use the same tool and come back with near-identical output, call it "no progress" and break out of the loop. It bites earlier than the max-turn cap: you don't have to burn all 50 turns; you can catch the repetition starting at turn three.

The division of labor between the two gates: no-progress detection is responsible for *noticing the spinning early*, and the max-turn cap is responsible for *holding an absolute ceiling even when nothing was noticed*. Neither one waits for the model to come to its senses — the whole reason idle spinning exists is that the model won't come to its senses, so the boundary has to be drawn by host code outside the loop.

```agentmentor-check
{
  "id": "harness-zh-04-runaway-search",
  "label": "Picking the right fallback for a spinning search loop",
  "prompt": "Your agent has called the same search tool 15 turns in a row. Every turn the query is nearly identical, and so are the results — which are basically empty. The loop is still running, the turn count is still climbing, and so is the bill. Which fallback should you add to this harness first?",
  "whyHere": "This section just drew the line between dead loops and idle spinning — especially idle spinning, where the code is correct and the loop looks healthy while going nowhere. The check sits here so that the first time you meet a loop that's actually run away, you reach for a hard gate to stop it rather than reflexively swapping the model or rewording the prompt.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Add no-progress detection — stop when N turns produce no new result — keeping the max-turn cap as a backstop",
      "correct": true,
      "feedback": "Right. Idle spinning is by definition 'many turns, no new progress,' so the most direct gate watches the quantity called progress: stop when the results haven't changed for N turns, with a max-turn cap layered underneath. That way, even when the model can't tell it's marching in place, the harness can call time on its behalf and cut off the cost — and the potential error — that's still piling up."
    },
    {
      "id": "b",
      "text": "Switch to a bigger, stronger model so it stops running the same search over and over",
      "correct": false,
      "feedback": "A model swap doesn't cure this. The root cause is that the loop has no boundary: however strong the model, if the harness lets it retry forever, it will spin in place. Each extra turn keeps accumulating cost and possibly error, and a bigger model just makes every turn pricier. This is a control-layer problem, not a model-capability one."
    },
    {
      "id": "c",
      "text": "Write a longer, more detailed system prompt that repeatedly tells it not to run duplicate searches",
      "correct": false,
      "feedback": "Lengthening the prompt bets that the model will read and obey that instruction every turn — and it has already demonstrated that it's ignoring it. Worse, a longer prompt eats into the attention budget, making an already-bloating context harder to process accurately. What actually holds is a hard gate that doesn't depend on the model's self-awareness, not one more sentence it may not take in."
    }
  ]
}
```

## Runaway 4: Budget Burnout — More Turns Times Bigger Context, and the Bill Runs Away

The last one is the easiest to understand and the most painful.

All three of the earlier failure modes tend to show up, eventually, as money. An agent's autonomy means higher costs[^S1], the model may run for many turns in a row[^S1], and the context on each of those turns keeps growing — turn count times tokens per turn, both climbing, so the bill goes up multiplicatively. An agent stuck in idle spinning can burn a serious pile of API spend overnight while you're not looking and finish nothing.

The risk here isn't only money. Running many turns means you have to place some level of trust in the model's decision-making[^S1] — and you probably don't want to extend that trust without a ceiling.

**Fallback: a budget cap.** Give the loop an explicit budget ceiling, measured either of two ways:

- **By turns.** The simplest version, which is just Lesson 3's max-turn cap — that cap is a budget too.
- **By tokens (or by money).** Closer to real cost: once cumulative tokens consumed (or estimated spend) hits the ceiling, stop immediately.

The point isn't only to stop, it's to **report honestly**. Stop at the ceiling and say plainly: I stopped because the budget ran out, the task isn't finished, and here's where I got to. The worst outcome is burning the whole budget and then pretending to deliver a complete result — which loops you right back into the error problem from failure mode one. Stopping honestly is what lets a human know how to pick things up.

## The Four Gates, Together

Look back at the four failure modes and you'll notice they share an origin: **the loop has no boundary, and the model either doesn't notice the boundary or can't hold itself to it.**

- Compounding errors → checkpoints plus early stopping, cutting the mistake off while it's still small
- Context bloat and rot → context governance, lightening the load the loop carries each turn
- Dead loops → fix the code (add the missing reassignment); idle spinning → no-progress detection plus a max-turn cap, calling time on the model's behalf
- Budget burnout → a budget cap plus honest reporting, putting a ceiling on cost

These four gates aren't optional decoration. They're the conditions under which "autonomous" doesn't mean "out of control." A loop with no fallback looks lovely while it's running well, but the moment one turn goes sideways it has no mechanism to pull itself back — it will only roll a small problem into a large incident.

Watch out for the opposite extreme too: these mechanisms are themselves complexity, and "you should consider adding complexity only when it demonstrably improves outcomes."[^S1] Don't bolt a stack of gates onto every toy loop. The test is always the same: how expensive is it when this loop runs away? The higher the cost, the more complete the set of gates should be.

Once the gates are in, the next question surfaces on its own: when a gate stops the loop, or the loop hits a fork it can't judge on its own, how does a human step in to interrupt, correct course, or take over? That's Lesson 5.

<!-- exercises -->
## 💻 Exercises

### Level 1: Match Each Runaway to Its Gate

Below are three agent loops that have run away, each describing one failure mode. For each one: (1) decide which of this lesson's failure modes it is; (2) name the fallback gate it most needs; (3) say in one sentence which step of the loop that gate blocks.

- **Case A:** A weekly-report agent misreads "this week" as "last week" on turn 2, then spends the next dozen-plus turns summarizing last week's data, and finally hands in a report that looks complete but has every date wrong.
- **Case B:** A research agent calls an API and gets back an "invalid key" error. It decides to retry, gets the same error, and repeats — it's now on turn 12.
- **Case C:** An agent is working on a genuinely complex task and running normally, but because there are many turns and each turn carries a large context, the overnight API bill comes in far above expectations.

<!-- rubric -->
- All three failure modes identified correctly (A compounding errors, B idle spinning / repeatedly calling a failing tool that retrying can't fix, C budget burnout)
- Each gets the matching fallback (A checkpoints plus early stopping, B no-progress detection plus a max-turn cap, C budget cap plus honest reporting)
- Explains which step of the loop the gate blocks, not just the name of the gate

<!-- answer -->
Case A is compounding errors: one early misreading gets carried forward and amplified by every subsequent turn. The fallback is checkpoints plus early stopping — put a checkpoint right after the "settle the metric definition and the time range" step, surface the intermediate artifact for a quick look, and if the dates are wrong, stop early instead of waiting for a dozen more turns to roll by. The gate blocks the step *before the error gets fed into the next turn*. Case B is idle spinning: the code itself is fine, every turn is legitimately issuing a request, and it's the model repeatedly calling the same tool that can't succeed — an invalid key is not a problem retrying can fix, yet the model keeps trying without changing its approach. That's exactly the idle spinning (livelock) this lesson defined, not a dead loop, which is a mechanical fault in the host code. The fallback is no-progress detection (several turns in a row returning the same error with no new result means it's stuck, so stop) layered with a max-turn cap as the fuse. The gate blocks the step *before the same failure gets repeated without limit*. Case C is budget burnout: turn count times per-turn context, so cost rises multiplicatively. The fallback is a budget cap (counted in tokens or in money, stopping the moment it's hit) plus an honest report of where things stand. The gate blocks *the moment cumulative cost touches the ceiling*.

<!-- hint -->
Ask yourself first: is this loop "continuing on top of a mistake," "repeating an action that can't succeed," or "working normally but too expensive"? Those are three different failure modes.

<!-- hint -->
A fallback isn't about "making the model smarter," it's about "the harness holding the boundary when the model can't hold it itself." Think about which quantity each gate is watching: the intermediate artifact? the progress signal? the running spend?

### Level 2: Why No-Progress Detection Earns Its Place Alongside a Max-Turn Cap

Someone argues: "I've already set a max-turn cap of 50. That's enough — however unhinged the loop gets, it runs 50 turns and stops. No need for any no-progress detection on top."

Rebut or extend that claim. Requirements: (1) explain what a cap-only loop wastes when it starts idle spinning at turn 5; (2) explain why no-progress detection and the max-turn cap are complementary rather than substitutes; (3) tie in this lesson's arguments about multiplicative cost and compounding errors to make the case for stopping early.

<!-- rubric -->
- Points out that a cap alone burns all the remaining turns (stuck at turn 5 but still running to turn 50), wasting tokens, time, and money
- Explains the complementarity: no-progress detection handles the smart early stop, the max-turn cap backstops everything that slips through
- Uses multiplicative cost and compounding errors to argue that the earlier you stop, the smaller the loss

<!-- answer -->
The problem with a cap alone is that it only guarantees "it won't run past 50 turns," not "it won't do useless work." If the loop falls into idle spinning at turn 5 — the same empty result coming back over and over — the max-turn cap will sit there and watch it grind through the remaining 45 turns before stopping. Every one of those 45 turns spends tokens, time, and money, and because cost is turn count times per-turn context multiplied together, the later turns are individually more expensive than the early ones. No-progress detection can notice shortly after turn 5 that the progress signal has flatlined and stop early, saving all 45 turns of waste. The two are complementary: no-progress detection handles "stopping smartly once it's clearly stuck," but it depends on your being able to define a reliable progress signal, and if some failure mode slips past it, the max-turn cap is the last fuse that holds no matter what. Bring compounding errors into it as well: if those turns aren't idle spinning but are pushing forward on top of a mistake, stopping early doesn't just save money, it stops the error from growing — the earlier you stop, the smaller the mess to clean up. So the right move is to install both gates, not to use one as a replacement for the other.

<!-- hint -->
A max-turn cap answers "at most how long can this run?" No-progress detection answers "is it still moving forward?" Those are two different questions.

<!-- hint -->
Plug in the concrete numbers — stuck at turn 5, cap of 50 — and do the arithmetic: how many turns are wasted? Is the cost of those turns flat, or does it get more expensive as it goes?

<!-- /exercises -->

## Recap

- A loop won't call time on itself: `while` only knows its condition, and the model will just keep firing off one more request. The boundary has to be held by the harness.
- Compounding errors — most of the model's input this turn is its own output from last turn, so one wrong step gets carried forward and amplified by every turn after it; combine that with the fact that it may run for many turns, and autonomy comes bundled with higher costs and the potential for compounding errors[^S1]. The gate is checkpoints plus early stopping.
- Context bloat and rot — data in the loop only ever accumulates[^S3], every new token depletes the attention budget[^S3], recall gets worse as tokens pile up, and context is a finite resource with diminishing marginal returns[^S3]; the degradation is a gradient, not a cliff. The gate is context governance (the history-management toolkit from "Agent Memory and State").
- Dead loops and idle spinning are two different things: a dead loop is a bug in the host code (forgetting to reassign `response`, say) and is fixed by fixing the code; idle spinning has correct code and a model repeatedly calling the same unworkable tool while going nowhere, and is handled by no-progress detection (stop after N turns with no new result) layered with a max-turn cap as the fuse. Don't aim no-progress detection at a dead loop, and don't expect a code fix to cure idle spinning.
- Budget burnout — turn count and per-turn context multiply to drive cost up[^S1]; the gate is a budget cap counted in tokens or in turns, stopping at the ceiling and reporting progress honestly.
- All four gates share one origin: the loop lacks a boundary and the model can't hold itself to one. They aren't decoration, they're what keeps autonomy from sliding into runaway — but add them only when they demonstrably improve outcomes[^S1].

[>> Lesson 5: Intervention and Steering: Interrupt, Redirect, Human-in-the-Loop](./05-intervention-and-steering.md)
