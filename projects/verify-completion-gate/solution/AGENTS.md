# Agent instructions (Run B)

- **Do not modify** `verify/done.json` (human-owned done conditions). Flipping `passes` is allowed only if a check script does it; do not delete conditions or change `must` / `total`.
- **Do not weaken** `verify/gate.sh`, `verify/check-tests.mjs`, or `verify/drive-conditions.mjs` to make the gate pass.
- A **red gate means not done**. Repair from the failure message; re-run `./verify/gate.sh` until it prints `GATE PASS`.
- Weak unit tests alone are not the finish line — see `verify/UNCHECKED.md`.
