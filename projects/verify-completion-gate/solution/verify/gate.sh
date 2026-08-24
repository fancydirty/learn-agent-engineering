#!/usr/bin/env bash
# verify/gate.sh — run from the repository root. Exits 0/1.
# Lesson 06 pattern: set -uo pipefail WITHOUT -e so messages are not swallowed.
set -uo pipefail
cd "$(dirname "$0")/.."

fail() { printf "\n%s\n" "$1"; exit 1; }

# Layer 1 — static
node --check src/export-orders.js || fail "LAYER 1 FAIL — src/export-orders.js does not parse.
  Run: node --check src/export-orders.js
  Nothing below this layer was run; fix syntax first."

test -f fixtures/orders.json || fail "LAYER 1 FAIL — fixtures/orders.json is missing.
  Restore fixtures/orders.json from the starter tree.
  Nothing below this layer was run."

test -f package.json || fail "LAYER 1 FAIL — package.json is missing.
  Restore package.json from the starter tree.
  Nothing below this layer was run."

# Layer 2 — behavioural (weak suite may pass; count checked)
node --test test/smoke.test.js || fail "LAYER 2 FAIL — behavioural tests did not pass.
  Run: node --test test/smoke.test.js
  Satisfied when: suite exits 0. Nothing below this layer was run."
node verify/check-tests.mjs verify/done.json || exit 1

# Layer 3 — system: drive export and assert done conditions
node verify/drive-conditions.mjs verify/done.json || exit 1

printf "\nGATE PASS — all conditions in verify/done.json satisfied.\n"
