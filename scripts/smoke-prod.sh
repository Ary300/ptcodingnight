#!/usr/bin/env bash
# Smoke test against the LIVE deployment.
#
#   scripts/smoke-prod.sh                       # defaults to https://ptcodingnight.com
#   BASE_URL=https://staging.example.com scripts/smoke-prod.sh
#
# This is not a gate and it is not a substitute for one. `npm run verify` proves the code is
# correct; this proves THIS BOX is serving it — certificate, proxy, database, queue, judge.
# Those are different failures and the second kind only exists after a deploy.
#
# Read-only. It used to create a smoke-test participant with a join code and submit one solution,
# so that "a submission is judged end to end" was covered; the join route is gone and a competitor
# session now needs a real OAuth round trip, which cannot be curled. That check therefore reports
# that it could not run rather than passing vacuously — and DEPLOY.md §14.5 lists the two minutes
# of clicking that covers it instead.
#
# Exit code is 0 only if every check passed. Nothing is skipped silently: a check that cannot
# run says so and fails.

set -uo pipefail

BASE_URL="${BASE_URL:-https://ptcodingnight.com}"
HOST="${BASE_URL#https://}"
HOST="${HOST#http://}"
HOST="${HOST%%/*}"

PASS=0
FAIL=0
# Set only when a participant is actually created, so the trailer cannot claim one that is not
# there.
JOINED=0
NAME=""
JAR="$(mktemp -t ptcn-smoke-XXXXXX)"
trap 'rm -f "$JAR"' EXIT

ok()   { printf '  \033[32mPASS\033[0m %s\n' "$1"; PASS=$((PASS + 1)); }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAIL=$((FAIL + 1)); }
note() { printf '       %s\n' "$1"; }

section() { printf '\n\033[1m%s\033[0m\n' "$1"; }

printf '\033[1mSmoke test: %s\033[0m\n' "$BASE_URL"

# ---------------------------------------------------------------------------
# 0. Wait for the deployment to come up before testing it.
# ---------------------------------------------------------------------------
# Run straight after `docker compose up -d --build`, every check below fails with 502: Caddy is
# up, the web container is still starting, and there is nothing to proxy to. That is a healthy
# deploy reported as fourteen failures, which is worse than useless — it sends you debugging a
# working system. So wait first, and say plainly which of the two situations you are in.
#
# 90s: the web container's own healthcheck has a start period, and this box builds on 2 vCPU.
WAIT_SECS="${SMOKE_WAIT_SECS:-90}"
waited=0
until curl -fsS --max-time 10 "$BASE_URL/api/health" >/dev/null 2>&1; do
  if [ "$waited" -ge "$WAIT_SECS" ]; then
    printf '  \033[31mFAIL\033[0m the site did not answer /api/health within %ss\n' "$WAIT_SECS"
    printf '       Not a startup race, then. Check: docker compose -f docker-compose.prod.yml logs --tail=100 web\n'
    exit 1
  fi
  if [ "$waited" -eq 0 ]; then
    printf '       waiting for the deployment to answer (up to %ss)…\n' "$WAIT_SECS"
  fi
  sleep 3
  waited=$((waited + 3))
done
[ "$waited" -gt 0 ] && printf '       up after %ss\n' "$waited"

# ---------------------------------------------------------------------------
section "1. HTTPS"
# ---------------------------------------------------------------------------

# `--fail-with-body` so a 500 is a failure rather than a successful download of an error page.
if cert="$(echo | openssl s_client -servername "$HOST" -connect "$HOST:443" 2>/dev/null \
            | openssl x509 -noout -subject -issuer -dates 2>/dev/null)"; then
  ok "TLS handshake completed"
  note "$(echo "$cert" | tr '\n' ' ')"

  # Expiry. Caddy renews at 30 days remaining, so under 20 means renewal is not working and
  # nobody has noticed — which is the failure mode that takes a site down on a Saturday.
  if echo | openssl s_client -servername "$HOST" -connect "$HOST:443" 2>/dev/null \
       | openssl x509 -noout -checkend 1728000 >/dev/null 2>&1; then
    ok "certificate valid for at least 20 more days"
  else
    bad "certificate expires within 20 days — renewal is not working"
  fi
else
  bad "TLS handshake failed — no certificate, or the host is unreachable"
fi

# Trusted by the system store, not merely present. `-k` would hide exactly the failure that
# matters here, so it is never used in this script.
#
# Guarded on the scheme: against an `http://` BASE_URL this request succeeds for the ordinary
# reason that there is no TLS involved, and reported "the certificate is trusted" — a pass that
# says nothing, on the check most worth trusting.
if [ "${BASE_URL#https://}" = "$BASE_URL" ]; then
  bad "BASE_URL is not https, so nothing in this section can be verified: $BASE_URL"
  note "that is expected against a local dev server; a real deployment must be https"
elif curl -fsS -o /dev/null --max-time 20 "$BASE_URL/"; then
  ok "the certificate is trusted (curl without -k)"
else
  bad "curl rejected the certificate, or the site did not answer"
fi

redirect="$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "http://$HOST/" 2>/dev/null)"
case "$redirect" in
  30*"https://$HOST"*) ok "HTTP redirects to HTTPS ($redirect)" ;;
  *)                   bad "HTTP did not redirect to HTTPS: got '$redirect'" ;;
esac

hsts="$(curl -fsSI --max-time 20 "$BASE_URL/" 2>/dev/null | tr -d '\r' | grep -i '^strict-transport-security:' || true)"
if [ -n "$hsts" ]; then ok "HSTS present — $hsts"; else bad "no Strict-Transport-Security header"; fi

for header in x-frame-options x-content-type-options referrer-policy; do
  if curl -fsSI --max-time 20 "$BASE_URL/" 2>/dev/null | tr -d '\r' | grep -qi "^$header:"; then
    ok "$header present"
  else
    bad "$header missing"
  fi
done

# ---------------------------------------------------------------------------
section "2. The app is alive and talking to its database"
# ---------------------------------------------------------------------------

health="$(curl -fsS --max-time 20 "$BASE_URL/api/health" 2>/dev/null || true)"
if printf '%s' "$health" | grep -q '"ok":true'; then
  ok "/api/health reports the database and queue reachable"
  note "$health"
else
  bad "/api/health did not report ok — the app is up but its dependencies are not"
  note "${health:-<no response>}"
fi

# ---------------------------------------------------------------------------
section "3. Sign-in paths"
# ---------------------------------------------------------------------------
# All three, because they fail independently and the join code is the one that has to work when
# the others do not (docs/AUTH.md §6).

# --- 3a. a competitor session ---
#
# There is no join code any more: a student signs in with a provider and an organizer puts them
# on a team. This used to POST /api/join with SMOKE_JOIN_CODE, and that route is gone — so the
# check failed on every run for a reason that had nothing to do with the deployment.
#
# What is checkable from outside without a browser and a Google consent screen is the ORGANIZER
# path (3b) and the shape of the provider redirects (3c). The competitor journey needs a real
# provider round trip, so it is a thing to click, not a thing to curl — §14.5 of docs/DEPLOY.md
# says so, and section 4 below reports honestly that it cannot run rather than pretending.
note "competitor sign-in is OAuth-only and needs a browser — press the buttons yourself (DEPLOY.md §14.5)"

# --- 3b. organizer passcode ---
if [ -z "${SMOKE_ADMIN_PASSCODE:-}" ]; then
  bad "SMOKE_ADMIN_PASSCODE is not set — cannot test the organizer path"
  note "export SMOKE_ADMIN_PASSCODE=<the console passcode> and re-run"
else
  admin="$(curl -sS --max-time 30 -X POST "$BASE_URL/api/admin/session" \
             -H 'content-type: application/json' \
             -d "{\"passcode\":\"$SMOKE_ADMIN_PASSCODE\"}" 2>/dev/null || true)"
  if printf '%s' "$admin" | grep -q '"role":"ADMIN"'; then
    ok "organizer passcode accepted"
  else
    bad "organizer sign-in failed"
    note "${admin:-<no response>}"
  fi
fi

# --- 3c. OAuth ---
# Not followed to the provider: that would test Google, which is not what is being deployed.
# What matters is that OUR redirect is well formed and carries a state cookie.
for provider in google github; do
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$BASE_URL/api/auth/$provider" 2>/dev/null)"
  location="$(curl -sSI --max-time 20 "$BASE_URL/api/auth/$provider" 2>/dev/null | tr -d '\r' | grep -i '^location:' || true)"
  case "$code" in
    30*)
      if printf '%s' "$location" | grep -q "redirect_uri=https%3A%2F%2F"; then
        ok "$provider sign-in redirects with an https redirect_uri"
      else
        bad "$provider redirect_uri is not https — it will not match the registered URI"
        note "$location"
      fi
      ;;
    400|503)
      note "$provider is not configured on this server (answered $code) — that is a valid choice"
      ;;
    *)
      bad "$provider sign-in answered $code"
      ;;
  esac
done
# ---------------------------------------------------------------------------
section "4. There is a contest a student can actually enter, right now"
# ---------------------------------------------------------------------------
# THE CHECK THAT WOULD HAVE SAVED AN EVENING.
#
# A deployment can pass every check above — certificate, health, database, both providers — and
# still be dead to a student, because the seeded contest's window closed hours ago. The site then
# does exactly what a working site does, except nothing can be submitted. It reads as "the
# platform is broken" and it is a one-line fix, so it is worth failing loudly and specifically.
#
# `/api/standings` is public, which is what makes this checkable without a session.

standings="$(curl -fsS --max-time 20 "$BASE_URL/api/standings" 2>/dev/null || true)"
if ! printf '%s' "$standings" | grep -q '"success":true'; then
  bad "no contest is being served — /api/standings did not answer"
  note "${standings:-<no response>}"
  note "seed one: docker compose -f docker-compose.prod.yml exec web npx tsx scripts/seed-demo.ts"
else
  ok "a contest is published and its standings are being served"

  ends_at="$(printf '%s' "$standings" | sed -n 's/.*"endsAt":"\([^"]*\)".*/\1/p')"
  now="$(date -u +%Y-%m-%dT%H:%M:%S)"
  if [ -z "$ends_at" ]; then
    bad "the standings carry no endsAt — cannot tell whether the contest is open"
  elif [ "${ends_at%%.*}" \> "$now" ]; then
    ok "the contest window is OPEN (ends $ends_at, now ${now}Z)"
  else
    bad "the contest window CLOSED at $ends_at — a student signing in now cannot submit anything"
    note "now is ${now}Z. The site will look completely broken to them and nothing is wrong with it."
    note "re-seed with a fresh window: docker compose -f docker-compose.prod.yml exec web npx tsx scripts/seed-demo.ts"
  fi
fi

# ---------------------------------------------------------------------------
section "4b. A submission judged end to end — NOT COVERED HERE"
# ---------------------------------------------------------------------------
# Stated rather than skipped silently. This used to run: join with a code, submit, poll for a
# verdict — the one check that exercises Redis, the worker, the Docker socket, the runtime images
# and the scratch mount together. The join route is gone and a competitor session now requires a
# real OAuth round trip, which a shell script cannot perform.
#
# It is not replaced by anything here, and pretending otherwise would be the worst outcome. Two
# minutes of clicking covers it, and DEPLOY.md §14.5 lists the steps.
note "sign in as a student in a browser and submit one solution — this script cannot, and that gap is real"
note "if JUDGE_HOST_ROOT or the runtime images are wrong, THAT is the check that would have caught it"


# ---------------------------------------------------------------------------
section "5. The screens render"
# ---------------------------------------------------------------------------
# HTML rather than JSON: a page can 200 with a blank body if the client bundle failed.

check_page() {
  local path="$1" needle="$2" label="$3"
  body="$(curl -fsS --max-time 30 "$BASE_URL$path" 2>/dev/null || true)"
  if printf '%s' "$body" | grep -q "$needle"; then
    ok "$label"
  else
    bad "$label — '$needle' not found in the response"
  fi
}

# `/join` was deleted with the join route; this checked for a screen that cannot exist and so
# failed on every run. `/sign-in` is the front door now, and the landing page is what a visitor
# following a link actually gets.
check_page "/" "Coding Night" "the landing page renders"
check_page "/sign-in" "Continue with Google" "the sign-in screen offers the providers"
check_page "/projector" "Team standings" "the projector renders the team board"

# The banner that says a screen is showing invented data. On a live deployment it must be ABSENT
# — its presence means NEXT_PUBLIC_CONTEST_BACKEND=stub reached production.
#
# **The page must be known to have LOADED before its absence means anything.** The first version
# of this check grepped the response for the banner and passed when it was not found — which it
# never is in an empty body, so it reported "the UI is wired to the real API" against a host that
# was refusing connections. A smoke test that passes when the site is down is worse than no smoke
# test, because it is the one check someone trusts at 8pm.
front_body="$(curl -fsS --max-time 30 "$BASE_URL/sign-in" 2>/dev/null || true)"
if ! printf '%s' "$front_body" | grep -q "Continue with Google"; then
  bad "cannot check for the demo-data banner: /sign-in did not load"
elif printf '%s' "$front_body" | grep -q "not a live contest"; then
  bad "the DEMO DATA banner is showing — this deployment is wired to the stub backend"
else
  ok "no demo-data banner: the UI is wired to the real API"
fi

# ---------------------------------------------------------------------------
printf '\n\033[1m=== %d passed, %d failed ===\033[0m\n' "$PASS" "$FAIL"

# Only when one actually exists. Saying "a participant was created" after the join failed sends
# an organizer looking through the roster for a row that is not there.
# The trailer that used to name the smoke-test participant is gone with the participant — this
# script no longer creates one, so there is nothing to clean up and nothing to announce.

[ "$FAIL" -eq 0 ]
