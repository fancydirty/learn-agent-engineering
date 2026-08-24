# Metrics

Fill one row per run. Keep both agent final summaries nearby.

| Metric | Run A (starter) | Run B (gated) |
|--------|-----------------|---------------|
| Declared done? (yes / no / timeout) |  |  |
| False done? (declared done but gate would fail) |  | — |
| Human interventions (count) |  |  |
| Gate blocks before final pass (B only) | — |  |
| Final gate (pass / fail / not run) |  |  |
| Wall-clock minutes |  |  |

## Notes

- False done (A): after A stops, copy solution/verify/ onto a frozen copy of A and run ./verify/gate.sh. Fail means false done = yes.
- Gate blocks (B): count how many times ./verify/gate.sh returned red before the final green (or timeout).

## Agent final summaries

### Run A

(paste)

### Run B

(paste)
