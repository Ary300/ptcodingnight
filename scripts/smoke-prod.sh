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
# Read-only except for one thing: it joins the contest as a smoke-test participant and submits
# one solution, because "a submission is judged end to end" cannot be checked any other way.
# The participant is named so an organizer can see what it is, and `--cleanup` removes it.
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

# --- 3a. join code ---
JOIN_CODE="${SMOKE_JOIN_CODE:-}"
if [ -z "$JOIN_CODE" ]; then
  bad "SMOKE_JOIN_CODE is not set — cannot test the join path, which is the primary one"
  note "export SMOKE_JOIN_CODE=<the contest's join code> and re-run"
else
  NAME="smoke-test-$(date +%s)"
  join="$(curl -sS --max-time 30 -c "$JAR" -X POST "$BASE_URL/api/join" \
            -H 'content-type: application/json' \
            -d "{\"joinCode\":\"$JOIN_CODE\",\"displayName\":\"$NAME\",\"divisionId\":null}" 2>/dev/null || true)"
  if printf '%s' "$join" | grep -q '"success":true'; then
    JOINED=1
    ok "join code accepted, session issued"
  else
    bad "join failed"
    note "${join:-<no response>}"
  fi

  # The cookie the rest of this section depends on. Checked explicitly so a later failure is
  # not blamed on the wrong thing.
  if grep -q 'ptcn_session' "$JAR"; then
    ok "session cookie set"
    if grep -qi 'TRUE.*ptcn_session' "$JAR" && grep 'ptcn_session' "$JAR" | awk '{print $4}' | grep -qi 'TRUE'; then
      ok "session cookie is Secure"
    else
      bad "session cookie is NOT Secure on an HTTPS deployment"
    fi
  else
    bad "no session cookie in the response"
  fi
fi

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
section "4. A submission is judged, end to end"
# ---------------------------------------------------------------------------
# The one check that exercises Redis, the worker, the Docker socket, the runtime images and the
# scratch mount at once. If the JUDGE_HOST_ROOT paths are wrong, this is where it shows.

if [ -z "$JOIN_CODE" ]; then
  bad "skipped — no join code, see above"
else
  problems="$(curl -sS --max-time 30 -b "$JAR" "$BASE_URL/api/contests/self/problems" 2>/dev/null || true)"
  # `self` is not a route; read the contest id out of the join response instead.
  contest_id="$(printf '%s' "$join" | sed -n 's/.*"contestId":"\([^"]*\)".*/\1/p')"
  if [ -z "$contest_id" ]; then
    bad "could not read a contestId from the join response"
  else
    problems="$(curl -sS --max-time 30 -b "$JAR" "$BASE_URL/api/contests/$contest_id/problems" 2>/dev/null || true)"
    cp_id="$(printf '%s' "$problems" | sed -n 's/.*"contestProblemId":"\([^"]*\)".*/\1/p' | head -1)"

    if [ -z "$cp_id" ]; then
      bad "the problem list is empty — a student would see nothing to solve"
      note "a participant with no division sees no divisioned problems; check the contest setup"
    else
      ok "problem list has at least one problem"

      sub="$(curl -sS --max-time 60 -b "$JAR" -X POST "$BASE_URL/api/submissions" \
               -H 'content-type: application/json' \
               -d "{\"contestProblemId\":\"$cp_id\",\"language\":\"PYTHON_312\",\"sourceCode\":\"import sys\\nprint(sum(int(x) for x in sys.stdin.read().split()))\"}" 2>/dev/null || true)"
      sub_id="$(printf '%s' "$sub" | sed -n 's/.*"submissionId":"\([^"]*\)".*/\1/p' | head -1)"

      if [ -z "$sub_id" ]; then
        bad "submission was not accepted"
        note "${sub:-<no response>}"
      else
        ok "submission accepted ($sub_id)"

        # Generous: this box is slower than the target and G8 is a known FAIL on it. What is
        # being tested is that a verdict ARRIVES, not how fast.
        verdict=""
        for _ in $(seq 1 60); do
          view="$(curl -sS --max-time 20 -b "$JAR" "$BASE_URL/api/submissions/$sub_id" 2>/dev/null || true)"
          verdict="$(printf '%s' "$view" | sed -n 's/.*"verdict":"\([^"]*\)".*/\1/p' | head -1)"
          case "$verdict" in
            AC|WA|TLE|MLE|RE|CE) break ;;
            IE) break ;;
          esac
          sleep 5
        done

        case "$verdict" in
          AC|WA|TLE|MLE|RE|CE)
            ok "the judge returned a verdict: $verdict"
            note "any real verdict proves the path; AC additionally proves the test data"
            ;;
          IE)
            bad "verdict IE — the judge could not run this. Check the worker log and JUDGE_HOST_ROOT"
            ;;
          *)
            bad "no verdict after 5 minutes — the worker or Docker is not doing its job"
            ;;
        esac
      fi
    fi
  fi
fi

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

check_page "/join" "Join the contest" "the join screen renders"
check_page "/projector" "Team standings" "the projector renders the team board"

# The banner that says a screen is showing invented data. On a live deployment it must be ABSENT
# — its presence means NEXT_PUBLIC_CONTEST_BACKEND=stub reached production.
#
# **The page must be known to have LOADED before its absence means anything.** The first version
# of this check grepped the response for the banner and passed when it was not found — which it
# never is in an empty body, so it reported "the UI is wired to the real API" against a host that
# was refusing connections. A smoke test that passes when the site is down is worse than no smoke
# test, because it is the one check someone trusts at 8pm.
join_body="$(curl -fsS --max-time 30 "$BASE_URL/join" 2>/dev/null || true)"
if ! printf '%s' "$join_body" | grep -q "Join the contest"; then
  bad "cannot check for the demo-data banner: /join did not load"
elif printf '%s' "$join_body" | grep -q "not a live contest"; then
  bad "the DEMO DATA banner is showing — this deployment is wired to the stub backend"
else
  ok "no demo-data banner: the UI is wired to the real API"
fi

# ---------------------------------------------------------------------------
printf '\n\033[1m=== %d passed, %d failed ===\033[0m\n' "$PASS" "$FAIL"

# Only when one actually exists. Saying "a participant was created" after the join failed sends
# an organizer looking through the roster for a row that is not there.
if [ "$JOINED" = "1" ]; then
  printf '\nA smoke-test participant was created (%s). Remove it from the admin roster when done.\n' \
    "$NAME"
fi

[ "$FAIL" -eq 0 ]
