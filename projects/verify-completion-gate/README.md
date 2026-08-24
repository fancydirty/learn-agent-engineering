# Contrast project: Verify Completion Gate

Felt rehearsal for Verifying Agent Output (lessons 04–06): same task twice, one variable changed — whether an external three-layer gate is present.

Course: ../../courses/learn-verify-agent-output/en/README.md

Time box: 45–60 minutes total. Stop a run at about 25 minutes wall clock and record timeout.

## What you will feel

Run A often ends with green weak tests and a confident done while the CSV is still broken (a note with a comma splits a row). Run B gate stays red until quoting is fixed — even though those same weak tests stay green.

## Layout

- README.md — this protocol
- task-prompt.md — identical prompt for both runs
- metrics.md — blank score table
- starter/ — Run A material (weak tests, fragile export, no verify/)
- solution/ — Run B material (same broken app + verify/ gate pack)

## Protocol

1. Copy starter/ to run-a/ and solution/ to run-b/ as sibling directories (not two git branches — agents explore the tree).
2. Run A: give the agent only task-prompt.md and the run-a/ tree. Stop when it declares done. Fill metrics. Do not hand-fix the CSV.
3. Archive or delete run-a/ before starting B (contamination rule).
4. Run B: same task-prompt.md; confirm verify/ is present; tell the agent the gate is the finish line (./verify/gate.sh). When it claims done, run the gate. Fill metrics.
5. Keep both agent final summaries with metrics.md.

Optional after lesson 06: wire verify/gate.sh to a Stop or pre-push hook. Not required for v1 success.

## After the runs

- For Run A false-done check: copy solution/verify/ onto a frozen copy of A and run ./verify/gate.sh. If the gate fails, A was a false done.
- Success for this project design: careful learners usually get false done = yes on A and gate blocks >= 1 on B.

## Tie-in

- After 01–02: see why A green smoke tests lied
- After 04: recognize the three layers inside gate.sh
- After 05: read B red messages as repair instructions
- After 06: optional Stop hook; required: run the gate as one command

The course capstone remains wiring a gate into your own repo. This project is the rehearsal before that transfer.
