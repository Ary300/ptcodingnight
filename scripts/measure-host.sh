#!/usr/bin/env bash
#
# Measure this machine, so the judge's numbers describe the box that will run the contest.
#
# ## Why this is a script and not a runbook
#
# Every timing constant in `lib/judge/runtimes.ts` and every threshold in `docs/HOSTING.md` was
# fitted to a developer laptop, and a value fitted to one machine is wrong on every other one.
# That is not a theoretical worry: Java's startup budget is 45,000 ms because a program that adds
# two integers measured 38,473 ms on Docker Desktop, which makes Java time limits unenforceable —
# a SCORING error, not a speed one.
#
# Those numbers become wrong again the moment the droplet is resized. So this has to be one
# command that can be re-run after a resize, not a procedure to reassemble.
#
# ## What it does, in the order it must happen
#
#   0. Preflight — everything it needs, checked before anything is measured.
#   1. Judge images built and VERIFIED (this also proves the Go compile path on this host).
#   2. Startup budgets for all five runtimes, through the full judge path, under churn.
#   3. G4, G5, G13 — every container gate, on the machine that will host the contest.
#   4. G8 last, repeated, because one sample of a latency distribution is not a measurement.
#   5. The 1-in-40 IE — characterised from the database and the worker's own log.
#   6. A report to paste back.
#
# G8 IS LAST ON PURPOSE. Its 40-submission burst leaves the queue draining and the host loaded
# long after its own measurement ends, and anything measured in that wake is measuring the wake.
# The same rule is why `scripts/verify.sh` runs G8 after G9 and G13 (CLAUDE.md).
#
# ## Idempotent and safe to re-run
#
#   - Writes no source file and changes no configuration.
#   - Touches the database only through the gates themselves, which seed their own fixtures.
#   - Sweeps its own containers before and after, and removes its temporary proxy by name, so a
#     killed run leaves nothing for the next one to trip over.
#   - Results go to a timestamped directory; nothing is overwritten.
#
# ## Usage
#
#   scripts/measure-host.sh                      # full run
#   scripts/measure-host.sh --reps 5 --g8-runs 5 # more samples, longer
#   scripts/measure-host.sh --skip-gates         # budgets + G8 only
#   scripts/measure-host.sh --quick              # one rep, one G8 run — a smoke test of itself

set -euo pipefail
cd "$(dirname "$0")/.."

# --------------------------------------------------------------------------------------------
# Options
# --------------------------------------------------------------------------------------------
REPS=3
CHURN=0            # 0 = derive from cores
G8_RUNS=3
SKIP_GATES=0
COMPOSE_FILE="docker-compose.prod.yml"

while [ $# -gt 0 ]; do
  case "$1" in
    --reps)      REPS="$2"; shift 2 ;;
    --churn)     CHURN="$2"; shift 2 ;;
    --g8-runs)   G8_RUNS="$2"; shift 2 ;;
    --skip-gates) SKIP_GATES=1; shift ;;
    --quick)     REPS=1; G8_RUNS=1; shift ;;
    --compose)   COMPOSE_FILE="$2"; shift 2 ;;
    -h|--help)   sed -n '2,45p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

CORES="$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 1)"
# Churn should scale with the box: the point is to measure under contention a contest actually
# produces, and four competing workers on two cores is a different experiment from four on eight.
[ "$CHURN" -eq 0 ] 2>/dev/null && CHURN="$CORES"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="measurements/${STAMP}"
mkdir -p "$OUT"
REPORT="${OUT}/report.txt"

# --------------------------------------------------------------------------------------------
# Plumbing
# --------------------------------------------------------------------------------------------
PROXY_NAME="ptcn-measure-pgproxy"
PROXY_PORT=55432

say() { printf '%s\n' "$*" | tee -a "$REPORT"; }
rule() { say "------------------------------------------------------------------------"; }
step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; printf '\n== %s\n' "$*" >> "$REPORT"; }

cleanup() {
  docker rm -f "$PROXY_NAME" >/dev/null 2>&1 || true
  # Judge containers are created without --rm on purpose (docker inspect is the only way to read
  # OOMKilled), so a killed run can leave some. Sweeping by prefix is the documented backstop.
  local leaked
  leaked="$(docker ps -a --filter "name=ptcn-judge-" -q 2>/dev/null | wc -l | tr -d ' ')"
  if [ "${leaked:-0}" != "0" ]; then
    docker rm -f $(docker ps -a --filter "name=ptcn-judge-" -q) >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

fail() { echo "FAIL  $*" >&2; exit 1; }

# --------------------------------------------------------------------------------------------
# 0. Preflight
# --------------------------------------------------------------------------------------------
step "0. Preflight"

command -v docker >/dev/null 2>&1 || fail "docker is not installed"
docker ps >/dev/null 2>&1 || fail "cannot talk to the Docker daemon (are you in the docker group?)"
command -v node >/dev/null 2>&1 || fail "node is not installed on this host — the gates run here, not in a container"
command -v npm  >/dev/null 2>&1 || fail "npm is not installed"

[ -d node_modules ] || fail "node_modules is missing. Run: npm ci"
[ -d node_modules/.bin ] || fail "node_modules looks incomplete. Run: npm ci"
[ -f "$COMPOSE_FILE" ] || fail "$COMPOSE_FILE not found (pass --compose <file>)"
[ -f .env ] || fail ".env not found — this script reads POSTGRES_PASSWORD from it"

# `docker compose` (v2) or `docker-compose` (v1). The droplet shipped a v1 CLI too old to speak to
# the daemon once already; naming which one is in use costs nothing and saves a round trip.
if docker compose version >/dev/null 2>&1; then
  DC="docker compose -f $COMPOSE_FILE"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose -f $COMPOSE_FILE"
else
  fail "neither 'docker compose' nor 'docker-compose' is available"
fi

# shellcheck disable=SC1091
set -a; . ./.env; set +a
[ -n "${POSTGRES_PASSWORD:-}" ] || fail "POSTGRES_PASSWORD is not set in .env"

BASE_URL="${BASE_URL:-https://ptcodingnight.com}"

say "Park Tudor Coding Night — host measurement"
say "timestamp        : ${STAMP}"
say "host             : $(uname -s) $(uname -r) $(uname -m)"
say "cores            : ${CORES}"
say "memory           : $(free -m 2>/dev/null | awk '/^Mem:/{print $2" MB"}' || echo unknown)"
say "docker           : $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo unknown)"
say "cgroup           : $(stat -fc %T /sys/fs/cgroup 2>/dev/null || echo unknown)"
say "commit           : $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
say "base url         : ${BASE_URL}"
say "reps / churn     : ${REPS} / ${CHURN}"
say "g8 runs          : ${G8_RUNS}"
rule

# The stack has to be up: G8 talks to the running app, and the IE characterisation reads the
# worker's log. Everything else only needs Docker.
$DC ps >/dev/null 2>&1 || fail "compose stack not reachable with: $DC"
say "compose services :"
$DC ps --format '  {{.Name}}  {{.State}}' 2>/dev/null | tee -a "$REPORT" || $DC ps | tee -a "$REPORT"
rule

# --------------------------------------------------------------------------------------------
# 1. Judge images
#
# This runs first because everything after it judges something, and because --verify is what
# answers the open question about Go on this host: the check now runs the REGISTRY'S compile
# command, so if Go compiles here, students' Go submissions compile here.
# --------------------------------------------------------------------------------------------
step "1. Judge images (build + verify)"
if bash scripts/build-judge-images.sh --verify 2>&1 | tee "${OUT}/images.log"; then
  IMAGES_OK="PASS"
else
  IMAGES_OK="FAIL"
fi
say "judge images     : ${IMAGES_OK}   (${OUT}/images.log)"
[ "$IMAGES_OK" = "PASS" ] || fail "judge images are not ready; nothing measured after this would mean anything"

# --------------------------------------------------------------------------------------------
# 2. Startup budgets — the measurement this whole exercise is for
# --------------------------------------------------------------------------------------------
step "2. Runtime startup budgets (full judge path, under churn)"
if npx tsx scripts/measure-startup-budgets.ts --reps "$REPS" --churn "$CHURN" 2>&1 \
     | tee "${OUT}/startup-budgets.log"; then
  BUDGETS_OK="PASS"
else
  BUDGETS_OK="FAIL"
fi
say "startup budgets  : ${BUDGETS_OK}   (${OUT}/startup-budgets.log)"

# --------------------------------------------------------------------------------------------
# 3. Container gates — none of these has ever run on this machine
# --------------------------------------------------------------------------------------------
G4_OK="skipped"; G5_OK="skipped"; G13_OK="skipped"
if [ "$SKIP_GATES" = "0" ]; then
  step "3. Container gates (G4, G5, G13)"

  npm run test:judge   > "${OUT}/g4.log"  2>&1 && G4_OK="PASS"  || G4_OK="FAIL"
  say "G4 judge fixtures: ${G4_OK}   $(grep -aoE 'Tests +[0-9]+ (passed|failed)[^)]*\)?' "${OUT}/g4.log" | tail -1)"

  npm run test:sandbox > "${OUT}/g5.log"  2>&1 && G5_OK="PASS"  || G5_OK="FAIL"
  say "G5 sandbox       : ${G5_OK}   $(grep -aoE 'Tests +[0-9]+ (passed|failed)[^)]*\)?' "${OUT}/g5.log" | tail -1)"

  npm run test:content > "${OUT}/g13.log" 2>&1 && G13_OK="PASS" || G13_OK="FAIL"
  say "G13 content      : ${G13_OK}   $(grep -a 'references verified' "${OUT}/g13.log" | tail -1)"
fi

# --------------------------------------------------------------------------------------------
# 4. G8 — LAST, and repeated
#
# Postgres publishes no port (deliberately: "127.0.0.1 only" still means "anything that gets a
# shell"). The load test runs on this host and needs the database, so a proxy is stood up on
# loopback for the duration and removed by the exit trap. It is named, so a re-run after a kill
# reclaims it rather than colliding with it.
# --------------------------------------------------------------------------------------------
step "4. G8 load (${G8_RUNS} run(s), last so nothing else measures its wake)"

NET="$($DC ps -q postgres 2>/dev/null | head -1 | xargs -r docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null || true)"
[ -n "$NET" ] || fail "could not find the compose network for postgres"

docker rm -f "$PROXY_NAME" >/dev/null 2>&1 || true
docker run -d --rm --name "$PROXY_NAME" --network "$NET" \
  -p "127.0.0.1:${PROXY_PORT}:5432" alpine/socat \
  tcp-listen:5432,fork,reuseaddr tcp-connect:postgres:5432 >/dev/null \
  || fail "could not start the temporary postgres proxy"

# Give socat a moment to bind before the first connection.
for _ in 1 2 3 4 5 6 7 8 9 10; do
  (exec 3<>/dev/tcp/127.0.0.1/${PROXY_PORT}) 2>/dev/null && break
  sleep 1
done

export DATABASE_URL="postgresql://ptcn:${POSTGRES_PASSWORD}@127.0.0.1:${PROXY_PORT}/ptcn?schema=public"
export BASE_URL

G8_RESULTS=()
G8_OK="PASS"
for i in $(seq 1 "$G8_RUNS"); do
  log="${OUT}/g8-run${i}.log"
  if npm run test:load > "$log" 2>&1; then run_ok="PASS"; else run_ok="FAIL"; G8_OK="FAIL"; fi
  p95="$(grep -aoE 'p95 +: +[0-9]+ ms' "$log" | head -1 | grep -oE '[0-9]+' || echo "?")"
  verdicts="$(grep -a 'verdicts ' "$log" | tail -1 | sed 's/^ *//')"
  G8_RESULTS+=("run ${i}: ${run_ok}  p95=${p95} ms  ${verdicts}")
  say "G8 run ${i}         : ${run_ok}  p95=${p95} ms"
  # Let the queue drain before the next sample, or run 2 measures run 1's wake.
  sleep 20
done

# --------------------------------------------------------------------------------------------
# 5. The 1-in-40 IE
#
# Never explained, only narrowed. Two independent sources, because either alone is ambiguous:
# what the database recorded, and what the worker said at the time.
# --------------------------------------------------------------------------------------------
step "5. Internal-error characterisation"

psql_q() {
  docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" -i "$($DC ps -q postgres | head -1)" \
    psql -U ptcn -d ptcn -t -A -F'|' -c "$1" 2>/dev/null || true
}

IE_COUNT="$(psql_q "SELECT count(*) FROM \"Submission\" WHERE verdict='IE' AND \"submittedAt\" > now() - interval '2 hours';")"
IE_COUNT="${IE_COUNT:-0}"
say "IE in last 2h    : ${IE_COUNT}"

{
  echo "=== IE submissions (last 2h) ==="
  psql_q "SELECT s.id, s.language, s.\"submittedAt\", s.\"judgedAt\", s.\"runtimeMs\", s.\"judgeLogRef\"
          FROM \"Submission\" s WHERE s.verdict='IE' AND s.\"submittedAt\" > now() - interval '2 hours'
          ORDER BY s.\"submittedAt\";"
  echo
  echo "=== their test results ==="
  psql_q "SELECT tr.\"submissionId\", tr.\"testCaseId\", tr.verdict, tr.\"runtimeMs\", tr.\"memoryKb\"
          FROM \"TestResult\" tr JOIN \"Submission\" s ON s.id = tr.\"submissionId\"
          WHERE s.verdict='IE' AND s.\"submittedAt\" > now() - interval '2 hours';"
  echo
  echo "=== verdict distribution, last 2h (context for the rate) ==="
  psql_q "SELECT verdict, count(*) FROM \"Submission\"
          WHERE \"submittedAt\" > now() - interval '2 hours' GROUP BY verdict ORDER BY 2 DESC;"
  echo
  echo "=== worker log: errors, requeues and IE around the run ==="
  $DC logs --since 2h worker 2>&1 | grep -aiE 'error|ie\b|internal|requeue|ECONN|timeout|OOM|EACCES|ENOENT' | tail -120
} > "${OUT}/internal-errors.txt" 2>&1

say "IE detail        : ${OUT}/internal-errors.txt"
if [ "${IE_COUNT}" != "0" ]; then
  say ""
  say "  Worker lines mentioning an error (tail):"
  grep -aiE 'error|internal|requeue' "${OUT}/internal-errors.txt" | tail -12 | sed 's/^/    /' | tee -a "$REPORT" >/dev/null
fi

# --------------------------------------------------------------------------------------------
# 6. Report
# --------------------------------------------------------------------------------------------
step "6. Report"
rule
say "SUMMARY — paste this back"
rule
say "host             : ${CORES} cores, $(free -m 2>/dev/null | awk '/^Mem:/{print $2" MB"}' || echo '? MB'), docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo '?')"
say "commit           : $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
say "judge images     : ${IMAGES_OK}"
say "startup budgets  : ${BUDGETS_OK}"
say "G4 / G5 / G13    : ${G4_OK} / ${G5_OK} / ${G13_OK}"
say "G8               : ${G8_OK}"
for line in "${G8_RESULTS[@]}"; do say "  ${line}"; done
say "IE (last 2h)     : ${IE_COUNT}"
rule
say ""
say "MEASURED STARTUP BUDGETS (worst observed through the full judge path):"
grep -aE '^[[:space:]]*(python312|jdk21|gcc14|node22|go123)' "${OUT}/startup-budgets.log" 2>/dev/null \
  | tee -a "$REPORT" || say "  (see ${OUT}/startup-budgets.log)"
say ""
say "Suggested next step: the worst-observed values above are what RUNTIME_BUDGETS should be a"
say "multiple of. Do not copy a median — the budget exists to cover the worst case, and a budget"
say "fitted to a median fails correct solutions intermittently, which is the failure this project"
say "has already shipped three times."
rule
say ""
say "Full logs: ${OUT}/"

echo
echo "Report written to ${REPORT}"
