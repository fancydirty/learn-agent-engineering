# Lesson 4: Serial, parallel, and what bounds them

> Lesson objectives:
> - Derive a dispatch shape from a task's dependency structure rather than from how many pieces it has.
> - Name the shared resources that bound a fan-out even when the tasks are independent.
> - Recognise the failure signature of workers colliding on work that only looked divisible.
> - Choose a concurrency level you can justify, and say what you would do when a wave fails partway through.
>
> Prerequisites: Lessons 2 and 3 — briefs and return formats | Previous [<< 03](./03-what-comes-back-from-a-worker.md) | Next [05 >>](./05-synthesis-that-can-be-checked.md)

## Five workers, five failures, one cause

Five workers went out at once. Each had a good brief, a specified format, and a genuinely independent task. Every one of them died partway through with the same error.

Nothing was wrong with the decomposition. The tasks did not touch each other, share a file, or depend on each other's results. They shared something else, and it was not in the plan because it was not in the task description at all.

This lesson is about that gap: everything that bounds parallel work besides whether the work is parallel.

## Explanation

### The first question is not "how many"

Before concurrency there is structure. A task's pieces stand in one of three relationships, and each admits exactly one dispatch shape.

**Independent.** Piece B does not need piece A's result. Both can run at once. This is the shape the published gains came from: "breadth-first queries that involve pursuing multiple independent directions simultaneously."[^S1]

**Sequential.** B needs A's output. No amount of concurrency helps, and dispatching them together means B runs on a guess. Debugging is the standard example — what is worth looking at next depends on what the last step found.

**Staged.** Groups of independent pieces separated by a point where everything must converge. Five workers survey five services, then one decision, then five workers apply it. This is the most common real shape and the one people flatten by mistake, because from a distance ten pieces look like ten pieces.

The recommendation to keep dependent work in one place is explicit in the tooling documentation: agent teams "work best when teammates can operate independently. For sequential tasks, same-file edits, or work with many dependencies, a single session or subagents are more effective."[^S8]

Draw the structure first. If a piece needs something another piece produces, that edge is a stage boundary, and a stage boundary is not something a bigger fan-out can dissolve.

### The illusion of divisibility

A task can look independent and be one indivisible job wearing a crowd's clothing. The clearest published account of this comes from the sixteen-agent C compiler build.

While the work was a test suite, parallelism was free: "When there are many distinct failing tests, parallelization is trivial: each agent picks a different failing test to work on."[^S5] Sixteen agents, sixteen tests, no collisions.

Then the target changed to compiling the Linux kernel, and the same sixteen agents stopped making progress:

> "Unlike a test suite with hundreds of independent tests, compiling the Linux kernel is one giant task. Every agent would hit the same bug, fix that bug, and then overwrite each other's changes. Having 16 agents running didn't help because each was stuck solving the same task."[^S5]

Read the failure signature carefully, because it is what you will actually see: not errors, not crashes. Sixteen agents working hard, each producing a reasonable fix, overwriting each other. Throughput near zero with full utilisation.

The repair is the instructive part. They did not add agents, tune prompts, or add a coordinator. They changed the task so it had seams: compile most of the kernel with a known-good compiler, and only a subset with the one under test. "This let each agent work in parallel, fixing different bugs in different files."[^S5]

**Parallelism is a property of the task, and when it is missing the fix is to change the task, not the dispatch.** That is the same move as Lesson 1's schema file, arriving at a different scale.

This is one researcher's prototype reported as engineering observation, not a controlled experiment. Its value is that the collision and the repair are both described concretely enough to recognise in your own run.

### The narrowest shared resource

Now the thing that took down five workers with good briefs.

Independent tasks are not independent processes. Every worker in your fan-out contends for whatever they have in common, and the list is longer than it looks: the model API, your filesystem, a git repository, a test runner, a database, a rate limit.

API limits are the clearest case because they are documented. Rate limits are "set at the organization level," which means every worker you launch draws from one pool.[^S10] The pool refills continuously — the API "uses the token bucket algorithm... your capacity is continuously replenished up to your maximum limit, rather than being reset at fixed intervals" — so a burst can exceed a limit that a steady stream would stay under: "Short bursts of requests can exceed the limit and trigger rate limit errors."[^S10] There is a separate mechanism for exactly the shape a fan-out has: "You might also encounter 429 errors because of acceleration limits on the API if your organization has a sharp increase in usage. To avoid hitting acceleration limits, ramp up your traffic gradually."[^S10]

Note what that says. Not "if you use too much." If you go from nothing to five workers at once. **The concurrency itself is the trigger, independently of the total work.**

The infrastructure around a run is not neutral either. A study of agentic coding evals found "the gap between the most- and least-resourced setups on Terminal-Bench 2.0 was 6 percentage points," and states the reason in a way that applies directly here: "The runtime is no longer a passive container, but an integral component of the problem-solving process. Two agents with different resource budgets and time limits aren't taking the same test."[^S15] The same report notes, explicitly as an unquantified observation, that "pass rates fluctuate with time of day, likely because API latency varies with traffic patterns and incidents."[^S15] That is their anecdote, marked as one, and it is worth carrying only as a reason not to assume a failed run means a bad plan.

### One build's concurrency collapse

Here is the incident behind the hook, from the build that produced this course. It is a single observed incident, not a general law, and it is included because it is the failure mode that no published source describes at this resolution.

```text
Setup    One course, to be translated into five languages.
         Five workers dispatched in parallel, one per language.
         The tasks were genuinely independent: different files,
         different output paths, no shared state, no ordering.

Result   All five failed. Each returned a 500 from the same API
         gateway, each partway through its own work — not at the
         start, not at the same offset.

Repair   The same five tasks, re-run one at a time, with no other
         change: no prompt edits, no scope reduction, no retry
         logic. All five completed.
```

What that shows and does not show. It does not show that parallel dispatch is unsafe, or that five is too many, or that any particular limit was hit — the error was a 500, which the vendor documents as "an unexpected error has occurred internal to Anthropic's systems" with the guidance to "retry the request with exponential backoff," and not a 429, which is what a rate limit returns with a `retry-after` header.[^S11] The cause was never established.

What it does show is the structure of the risk. Five tasks with no relationship to each other failed together, because independence in the task graph says nothing about independence in the execution path. The tasks shared exactly one thing — the gateway — and that was enough for one condition to take out all five.

Two things generalise from it:

**The blast radius of a fan-out is the whole wave.** A serial run that fails leaves four completed tasks and one to retry. A parallel wave that hits a shared condition leaves five partial states, and partial is worse than failed — each one had written some output and not the rest.

**Serialisation is a legitimate repair, not a defeat.** Running five tasks one at a time keeps the decomposition and gives up only the wall-clock gain. If the decomposition was worth doing — independent pieces, focused briefs, bounded scope — it is still worth doing serially. What you lose is speed. What you keep is every other benefit.

### Blocking, and what it costs

Assume the wave survives. There is still a question about what the lead does while it runs.

The documented default is to block: "Currently, our lead agents execute subagents synchronously, waiting for each set of subagents to complete before proceeding. This simplifies coordination, but creates bottlenecks in the information flow between agents. For instance, the lead agent can't steer subagents, subagents can't coordinate, and the entire system can be blocked while waiting for a single subagent to finish searching."[^S1] They name the alternative and its price: asynchronous execution "would enable additional parallelism" but "adds challenges in result coordination, state consistency, and error propagation across the subagents."[^S1]

This is why the dispatch instruction has to say what to do about waiting — the documented requirement that a dispatch "should explain how to divide the work, whether Codex should wait for all agents before continuing, and what summary or output to return."[^S9]

Blocking has a consequence people meet without recognising it: **a blocking wave runs at the speed of its slowest worker.** Five workers averaging two minutes with one taking eleven is an eleven-minute wave. If you are sizing briefs for a parallel wave, size for the tail, not the mean — an unbounded piece in a wave of bounded ones sets the clock for all of them.

Cold starts add to that tail. A fresh worker "starts fresh and may need time to gather context," which is time each worker spends orienting before it does the work you asked for.[^S7]

### Choosing a number

The published operating point is small: "the lead agent spins up 3-5 subagents in parallel rather than serially," a change that "cut research time by up to 90% for complex queries."[^S1] Read the 90% as a best case on their workload — the phrasing is "up to," and their tasks are search-bound, where waiting dominates.

A defensible way to pick, given everything above. This ordering is the course's own arrangement of the sourced constraints rather than a rule from any single source:

```text
1. Read-heavy or write-heavy?
   Read-heavy → parallel is the documented starting point.
   Write-heavy → be careful: "agents editing code at once can create
   conflicts and increase coordination overhead."[^S9]

2. Are the pieces genuinely divisible, or one job in disguise?
   If every worker would touch the same thing, no fan-out fixes it.
   Change the task first.

3. What is shared underneath?
   API quota, filesystem, git, test runner, database. Everything on
   that list is a place where five independent tasks become one.

4. Start smaller than you want.
   Two or three workers on the first wave. A brief that is wrong is
   wrong five times in parallel, and you find out five times slower.

5. Can you review the output?
   "The natural bottleneck on all of this is how fast I can review
   the results."[^S12] Output you cannot check is not progress.
```

Step 4 is the one experienced people skip and regret. The first wave is a test of the brief as much as of the work.

## Worked example: one task, three dispatch shapes

The logging task from Lesson 1, now with the schema written. 200 endpoints, ten groups of twenty.

**Shape A — full parallel, ten at once.**

```text
Dispatch:  10 workers, all at once, 20 endpoints each
Wall clock: ~1 worker-duration, if nothing goes wrong
Shared:    the API quota, the repo, the test suite
Blast radius: all 10. A shared-resource failure leaves ten partial
           edit sets across 200 files, and no record of which
           endpoints were finished.
Review:    10 diffs arrive together, ~200 files to check at once.
```

Fast when it works. The failure mode is the concurrency-collapse shape: partial states everywhere, and the recovery is harder than the original task.

**Shape B — serial, one at a time.**

```text
Dispatch:  1 worker, 10 times
Wall clock: ~10 worker-durations
Shared:    same resources, one consumer at a time
Blast radius: 1 group. A failure leaves 9 clean groups and 1 to redo.
Review:    a diff at a time, which is how you can actually review.
Bonus:     group 2's brief can be corrected using what group 1
           revealed. In a parallel wave, all ten run on the
           uncorrected brief.
```

Slow, and strictly safest. Note the last line — serial dispatch is the only shape that lets the brief improve during the run.

**Shape C — staged waves of three.**

```text
Wave 1:    3 workers (groups 1-3).  Review. Fix the brief.
Wave 2:    4 workers (groups 4-7).
Wave 3:    3 workers (groups 8-10).
Wall clock: ~3-4 worker-durations
Blast radius: one wave, 3-4 groups.
Review:    3-4 diffs per batch, which is reviewable.
Bonus:     wave 1 is a real test of the brief at real cost, and
           waves 2-3 run on a corrected version.
```

Shape C is usually the right answer, and it is not a compromise — it is the shape that matches how you learn. Wave 1 tells you whether the schema survives contact with real endpoints. The first-wave-is-a-test property is worth more than the two worker-durations it costs, because a brief defect caught in wave 1 costs three groups and caught in shape A costs ten.

The choice among these is not about how many pieces exist. All three shapes have ten pieces. It is about how much you are willing to lose in one failure, and how much output you can actually review at once.

## Your turn: pick a shape

Four tasks. For each, name the dependency structure, the binding shared resource, and the dispatch shape.

```text
1. Summarise each of 12 incident reports from the last quarter.
   Structure: __________  Bound by: __________  Shape: __________

2. Find why the nightly job started failing on the 14th.
   Structure: __________  Bound by: __________  Shape: __________

3. Add a required field to 30 API response types, then regenerate
   the client SDK, then update the 8 places that consume it.
   Structure: __________  Bound by: __________  Shape: __________

4. Get 5 flaky integration tests passing, all touching the same
   fixture setup.
   Structure: __________  Bound by: __________  Shape: __________
```

Reference answers:

```text
1. Independent. Bound by API quota and by your reading speed —
   12 summaries arriving at once is more than anyone reviews
   carefully. Waves of 3-4. The canonical read-heavy fan-out, and
   the review bottleneck binds before any technical limit does.

2. Sequential. Bound by nothing shared, because it should not be a
   fan-out. Each finding determines the next question, so a worker
   dispatched at the start is working from a picture that is already
   stale. One session. The nearest legitimate parallel move is
   several workers testing named competing hypotheses — but that
   needs hypotheses, and at the start you have none.

3. Staged, with two hard boundaries. Stage 1: the 30 types can go in
   parallel, but only after the field's exact shape is fixed in an
   artifact — otherwise 30 workers invent 30 variants, which is
   Lesson 1's failure at a new address. Stage 2: regeneration is one
   job and cannot start until stage 1 is complete. Stage 3: the 8
   consumers are independent again. Bound by the git repository in
   stages 1 and 3, since parallel writers on one branch is the
   documented conflict case.

4. One job in disguise — the compiler-and-kernel shape exactly. Five
   tests, one fixture: every worker reaches the same setup code,
   fixes it its own way, and overwrites the others. Bound by the
   fixture. Either fix the fixture in one session first, at which
   point the five tests may become genuinely independent, or keep
   the whole thing in one session. Five workers here produces the
   full-utilisation, zero-throughput signature.
```

Item 4 is the test in its clearest form. **Count the shared thing, not the pieces.** Five tests is five pieces; one fixture is one job.

```agentmentor-action
mode: pressure_scenario
label: Kill my fan-out at the halfway point and make me plan the recovery
description: Tests whether my dispatch plan has an answer for a wave that fails partway through, or only for a wave that succeeds.
purpose: I want to find out what my parallel plan leaves behind when it breaks, before I run it on real work rather than after.
rules:
  - Ask me to describe my planned fan-out: how many workers, what each does, what each writes.
  - Then tell me that every worker has just failed, each partway through its own task, and none reported what it completed.
  - Ask me what state my repository or output directory is in right now, and how I would find out.
  - Ask which workers I can safely re-run and which would double-apply their changes.
  - If my answer is "I would just re-run everything," ask what that does to the ones that finished.
  - Do not offer solutions until I have described the wreckage myself. One question at a time.
```

<!-- exercises -->
## 💻 Exercises (point these at your own real environment)

### Level 1 (warm-up)

Take the task you verdicted SPLIT in Lesson 1 and draw its dependency structure before choosing any dispatch shape. Mark each edge where one piece needs another's output, identify the shared resources, and pick a wave size you can defend.

How: draw it on paper or in a text file — boxes for pieces, arrows for dependencies. Then list every resource two or more pieces would touch at the same time, including the ones that are not in the task description: the API, the repo, the test runner.

<!-- rubric -->
- A structure drawn, with each piece labelled independent, sequential, or part of a stage.
- Every dependency edge named, with what actually flows across it.
- At least three shared resources listed, including at least one not mentioned in the task itself.
- A wave size chosen, with a stated reason that refers to blast radius or review capacity rather than to speed.
- A one-sentence answer to: if this whole wave fails partway, what is left on disk?
<!-- answer -->
The usual discovery is a dependency you had been treating as an ordering preference. "We should probably do the schema first" is a stage boundary wearing a suggestion's clothing, and stage boundaries do not dissolve under more concurrency.

For shared resources, the ones people miss are the API quota and the git repository. Both are invisible in the task description and both turn independent tasks into contending ones — the quota because it is organisation-wide and burst-sensitive, the repository because parallel writers on one branch is the documented conflict case.

The last rubric item is the one that changes plans. Most people discover they cannot answer it, which means their workers write partial output with no record of what completed. The cheap fix is to have each worker write a completion marker as its last action, so a failed wave leaves evidence of who finished.
<!-- hint -->
For each pair of pieces, ask what would happen if they ran at the exact same second. The answer names the shared resource.
<!-- hint -->
If your structure has no edges at all, look again for a convention every piece must share. That convention is a stage boundary even when nothing flows across it as data.

### Level 2 (advanced)

Run the same real decomposition twice: once as a single parallel wave, once serially. Record wall-clock time, failures, and how long review took for each. Then decide which one you would use again and say why.

How: pick something with three or four pieces so the experiment is affordable and repeatable. Use the same briefs both times. Run the serial version second so any fix you were tempted to make can be recorded rather than applied — noting the temptation is part of the data.

<!-- rubric -->
- Both runs completed with identical briefs, and both recorded: wall clock, failures, retries.
- Review time measured separately from run time for each shape.
- Any failure classified: a shared-resource condition, a collision on the same work, or a brief defect.
- At least one thing named that the serial run let you see and the parallel run hid.
- A defended choice for next time that accounts for review time, not only run time.
<!-- answer -->
The finding that usually reverses people's assumption is that review time barely differs between the shapes, because the same volume of output has to be read either way. If the parallel run took four minutes and the serial run twelve, but review took twenty-five minutes in both cases, the fan-out saved eight minutes on a thirty-seven minute task. That is real and it is not the multiple people expect, and it is what the review-bottleneck argument is actually about.

The thing the serial run reveals is usually a brief defect. Running piece 1 alone shows you what the brief actually produces, and everyone feels the pull to fix it before piece 2. In a parallel wave that fix arrives after all the pieces have already run on the flawed version — which is the strongest argument for making the first wave small.

A common mistake in this exercise: treating a failure in the parallel run as bad luck and discounting it. Classify it instead. A shared-resource failure says something about your environment that will recur; a collision says the pieces were not as independent as the plan claimed; a brief defect says the same thing would have happened serially. Only the first is about parallelism at all.
<!-- hint -->
Time review separately and honestly, including the time spent switching between diffs. Context switching across parallel outputs is a real cost that does not appear in the run log.
<!-- hint -->
If the parallel run succeeds cleanly, that is a result too — record what the concurrency actually was and what was shared, so you know what the successful operating point looked like.
<!-- /exercises -->

## Structure before concurrency

The order of the questions is the lesson. Dependency structure first, because sequential work cannot be parallelised and staged work must not be flattened. Then whether the pieces are genuinely divisible, because a task with one shared core produces sixteen agents overwriting each other at full utilisation. Then what is shared underneath — the quota, the repository, the gateway — since that is where five independent tasks become one failure. Only then, how many at once, chosen against blast radius and review capacity rather than against speed.

The one build in this lesson's record lost a whole wave to a resource nobody had listed, and got everything back by running the same tasks one at a time. That is the trade in its plainest form: concurrency buys wall-clock and nothing else, and it puts the whole wave in one basket.

Assume now that the wave succeeded. Six reports are on the table, each one a heavy compression of work you did not watch, at least two of them quietly disagreeing. Something has to turn them into one answer — and that step is where a second layer of invention becomes possible.
