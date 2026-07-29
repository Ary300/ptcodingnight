#!/usr/bin/env bash
# Runs every gate in order and prints a PASS/FAIL table with real output.
#
# This script never stops at the first failure. The value of the table is seeing the whole
# board — knowing that G4 fails is much less useful than knowing G4 fails while G5 passes.
#
# A gate is PASS only on real, shown output. "Should pass" is FAIL. There is deliberately
# no way to mark a gate passed by hand.
#
# Scope: G0-G9 and G13 run here (docs/KICKOFF.md Phase 6), plus G12, which is one git command.
# G10 (cold start from a fresh clone) and G11 (/security-review on the full diff) are not
# things this script can honestly run, so they are printed as NOT RUN rather than assumed.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

RESULTS=()
FAILED=0

# What a gate needs beyond the repo itself. Printed next to a failure so "this box was not
# set up" is never mistaken for "this code is broken". A `case` rather than an associative
# array so this runs on the bash 3.2 that ships with macOS.
requires() {
  case "$1" in
    G4|G5) printf 'needs the Docker daemon' ;;
    G7)    printf 'needs Postgres + Redis; the api-judged project also needs the worker and Docker' ;;
    G8)    printf 'needs Postgres + Redis + a running judge worker + Docker' ;;
    G9)    printf 'needs a dev server on port 3100' ;;
    G13)   printf 'needs the Docker daemon' ;;
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
    local note need
    note="exit $status"
    need="$(requires "$id")"
    [ -n "$need" ] && note="$note — $need"
    RESULTS+=("$id|$label|FAIL|$note")
    FAILED=$((FAILED + 1))
  fi
}

# A row that is neither PASS nor FAIL, because the thing was not run here. It does not affect
# the exit code: calling these failures would be as dishonest as calling them passes.
note_gate() {
  RESULTS+=("$1|$2|NOT RUN|$3")
}

# --- Preconditions ---------------------------------------------------------
# A suite that "passes" because it never ran is the exact failure mode docs/KICKOFF.md
# forbids, so every dependency is probed and printed before anything else happens.
printf '\033[1m=== preconditions ===\033[0m\n'

DOCKER_UP=0
DOCKER_BASELINE=""
if docker ps >/dev/null 2>&1; then
  DOCKER_UP=1
  DOCKER_BASELINE="$(docker ps -a -q | wc -l | tr -d ' ')"
  printf '  docker daemon    up, docker ps -a baseline = %s\n' "$DOCKER_BASELINE"
else
  printf '  \033[1;31mdocker daemon    DOWN\033[0m — G4/G5/G8 and the api-judged E2E project cannot pass\n'
fi

if [ -f .env ]; then
  printf '  .env             present\n'
else
  printf '  \033[1;31m.env             MISSING\033[0m — copy .env.example to .env; G7/G8 need DATABASE_URL and ADMIN_PASSCODE\n'
fi

# Postgres and Redis, on the ports docker-compose.yml publishes.
for probe in "postgres:5432" "redis:6379"; do
  name="${probe%%:*}"
  port="${probe##*:}"
  if nc -z localhost "$port" >/dev/null 2>&1; then
    printf '  %-16s reachable on localhost:%s\n' "$name" "$port"
  else
    printf '  \033[1;31m%-16s UNREACHABLE\033[0m on localhost:%s — run `docker compose up -d`\n' "$name" "$port"
  fi
done

if pgrep -f "worker/index.ts" >/dev/null 2>&1; then
  printf '  judge worker     running\n'
else
  printf '  \033[1;33mjudge worker     not running\033[0m — `npm run worker`; G8 and the api-judged E2E project need it\n'
fi

# --- Gates -----------------------------------------------------------------
run_gate G0 "build          " "npm run build"
run_gate G1 "typecheck      " "npm run typecheck"
run_gate G2 "lint           " "npm run lint"
run_gate G3 "unit           " "npm test -- --coverage"
run_gate G4 "judge fixtures " "npm run test:judge"
run_gate G5 "sandbox        " "npm run test:sandbox"

# G5 has a second condition beyond its exit code: no leaked containers. Checked here, while
# the sandbox suite is still the only thing in this run that has created any.
if [ "$DOCKER_UP" = "1" ]; then
  DOCKER_AFTER_G5="$(docker ps -a -q | wc -l | tr -d ' ')"
  if [ "$DOCKER_AFTER_G5" != "$DOCKER_BASELINE" ]; then
    printf '\n\033[1;31mCONTAINER LEAK (G5)\033[0m docker ps -a went %s -> %s\n' \
      "$DOCKER_BASELINE" "$DOCKER_AFTER_G5"
    RESULTS+=("G5|sandbox leak  |FAIL|containers leaked: $DOCKER_BASELINE -> $DOCKER_AFTER_G5")
    FAILED=$((FAILED + 1))
  else
    printf '\n  G5 container check: docker ps -a back at baseline (%s)\n' "$DOCKER_BASELINE"
  fi
fi

run_gate G6 "scoring golden " "npm run test:scoring:golden"
run_gate G7 "e2e            " "npm run test:e2e"
run_gate G8 "load           " "npm run test:load"
run_gate G9 "a11y           " "npm run test:a11y"

# G13 runs AFTER G8, never alongside it. Both spawn containers, and interleaving them would
# corrupt G8's p95 latency — the only thing G8 measures. This script is strictly sequential,
# so ordering is the guarantee.
run_gate G13 "problem content" "npm run test:content"

# G7's judged project, G8 and G13 all create containers, so the host is checked again at the end
# of the run. A leak here is not G5's — it belongs to whichever gate created it.
if [ "$DOCKER_UP" = "1" ]; then
  DOCKER_FINAL="$(docker ps -a -q | wc -l | tr -d ' ')"
  if [ "$DOCKER_FINAL" != "$DOCKER_BASELINE" ]; then
    printf '\n\033[1;31mCONTAINER LEAK (whole run)\033[0m docker ps -a went %s -> %s\n' \
      "$DOCKER_BASELINE" "$DOCKER_FINAL"
    docker ps -a --filter "name=ptcn-judge" --format '  leaked: {{.Names}} {{.Status}}'
    RESULTS+=("-- |container leak|FAIL|docker ps -a $DOCKER_BASELINE -> $DOCKER_FINAL after the full run")
    FAILED=$((FAILED + 1))
  else
    printf '\n  whole-run container check: docker ps -a back at baseline (%s)\n' "$DOCKER_BASELINE"
  fi
fi

note_gate G10 "cold start     " "fresh clone + docker compose up -d + db:seed; not scriptable from inside the clone"
note_gate G11 "security       " "/security-review on the full diff; findings go in SECURITY.md"

run_gate G12 "clean tree     " "test -z \"\$(git status --porcelain)\" || { git status --porcelain; false; }"

# --- Table -----------------------------------------------------------------
printf '\n\n=== GATE STATUS ===\n'
for row in "${RESULTS[@]}"; do
  IFS='|' read -r id label status note <<<"$row"
  if [ -n "$note" ]; then
    printf '%-3s %s %-7s  %s\n' "$id" "$label" "$status" "$note"
  else
    printf '%-3s %s %-7s\n' "$id" "$label" "$status"
  fi
done
printf '=== END GATE STATUS ===\n\n'

if [ "$FAILED" -gt 0 ]; then
  printf '\033[1;31m%d gate(s) failed.\033[0m\n' "$FAILED"
  exit 1
fi
printf '\033[1;32mEvery gate run here passed. G10 and G11 are still NOT RUN.\033[0m\n'
