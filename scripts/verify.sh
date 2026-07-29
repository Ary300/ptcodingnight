#!/usr/bin/env bash
# Runs every gate in order and prints a PASS/FAIL table with real output.
#
# This script never stops at the first failure. The value of the table is seeing the whole
# board — knowing that G4 fails is much less useful than knowing G4 fails while G5 passes.
#
# A gate is PASS only on real, shown output. "Should pass" is FAIL. There is deliberately
# no way to mark a gate passed by hand.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

RESULTS=()
FAILED=0

# Gates whose absence is expected at this stage of the build. They still RUN and still
# report honestly; this only distinguishes "not built yet" from "built and broken" in the
# summary line. A `case` rather than an associative array so this runs on the bash 3.2 that
# ships with macOS.
delivered_in() {
  case "$1" in
    G4|G5) printf 'Phase 2' ;;
    G6)    printf 'Phase 3' ;;
    G7|G8) printf 'Phase 4' ;;
    G9)    printf 'Phase 5' ;;
    *)     printf '' ;;
  esac
}

run_gate() {
  local id="$1" label="$2" cmd="$3"
  printf '\n\033[1m=== %s %s ===\033[0m\n$ %s\n' "$id" "$label" "$cmd"

  local output status
  output="$(eval "$cmd" 2>&1)"
  status=$?
  printf '%s\n' "$output" | tail -25

  if [ $status -eq 0 ]; then
    RESULTS+=("$id|$label|PASS|")
  else
    local note phase
    note="exit $status"
    phase="$(delivered_in "$id")"
    [ -n "$phase" ] && note="$note — delivered in $phase"
    RESULTS+=("$id|$label|FAIL|$note")
    FAILED=$((FAILED + 1))
  fi
}

# --- Preconditions ---------------------------------------------------------
# The judge gates are meaningless without a daemon, and a suite that "passes" because it
# never ran is the exact failure mode docs/KICKOFF.md forbids.
DOCKER_UP=0
if docker ps >/dev/null 2>&1; then
  DOCKER_UP=1
  DOCKER_BASELINE="$(docker ps -a -q | wc -l | tr -d ' ')"
  printf '\033[1mprecondition\033[0m docker daemon up, docker ps -a baseline = %s\n' "$DOCKER_BASELINE"
else
  printf '\033[1;31mprecondition FAILED\033[0m docker daemon is not running — G4/G5/G8 cannot pass\n'
fi

# --- Gates -----------------------------------------------------------------
run_gate G0 "build          " "npm run build"
run_gate G1 "typecheck      " "npm run typecheck"
run_gate G2 "lint           " "npm run lint"
run_gate G3 "unit           " "npm test"
run_gate G4 "judge fixtures " "npm run test:judge"
run_gate G5 "sandbox        " "npm run test:sandbox"
run_gate G6 "scoring golden " "npm run test:scoring:golden"
run_gate G7 "e2e            " "npm run test:e2e"
run_gate G8 "load           " "npm run test:load"
run_gate G9 "a11y           " "npm run test:a11y"

# G5 has a second condition beyond its exit code: no leaked containers.
if [ "$DOCKER_UP" = "1" ]; then
  DOCKER_AFTER="$(docker ps -a -q | wc -l | tr -d ' ')"
  if [ "$DOCKER_AFTER" != "$DOCKER_BASELINE" ]; then
    printf '\n\033[1;31mCONTAINER LEAK\033[0m docker ps -a went %s -> %s\n' \
      "$DOCKER_BASELINE" "$DOCKER_AFTER"
    RESULTS+=("G5|sandbox leak  |FAIL|containers leaked: $DOCKER_BASELINE -> $DOCKER_AFTER")
    FAILED=$((FAILED + 1))
  fi
fi

# --- Table -----------------------------------------------------------------
printf '\n\n=== GATE STATUS ===\n'
for row in "${RESULTS[@]}"; do
  IFS='|' read -r id label status note <<<"$row"
  if [ -n "$note" ]; then
    printf '%-3s %s %-4s  %s\n' "$id" "$label" "$status" "$note"
  else
    printf '%-3s %s %-4s\n' "$id" "$label" "$status"
  fi
done
printf '=== END GATE STATUS ===\n\n'

if [ "$FAILED" -gt 0 ]; then
  printf '\033[1;31m%d gate(s) failed.\033[0m\n' "$FAILED"
  exit 1
fi
printf '\033[1;32mAll gates passed.\033[0m\n'
