# SECURITY

Accepted findings and the reasoning behind each. G11 (docs/PRD.md §12) requires zero high
or critical findings **or** an explicit documented rationale for every one that remains.

An entry here is a decision, not a backlog item. Anything that could plausibly be reached by
a student's submission does not belong on this page — it gets fixed.

---

## A1 — `brace-expansion` DoS in the ESLint toolchain (high, accepted)

**Advisory:** brace-expansion — DoS via unbounded expansion length causing an
out-of-memory process crash. CWE-400, CWE-770. Vulnerable range `<=5.0.7`.

**Where:** `eslint@9.39.5 -> minimatch@3.1.5 -> brace-expansion@1.1.16`. Reported as 9
findings because npm attributes it to every ESLint package in the chain
(`@eslint/config-array`, `@eslint/eslintrc`, `eslint-config-next`, `eslint-plugin-import`,
`eslint-plugin-jsx-a11y`, `eslint-plugin-react`, `minimatch`).

**Why it is accepted:**

1. **Not reachable at runtime.** ESLint is a devDependency. It is not imported by `app/`,
   `worker/`, or `lib/`, and it does not ship in the production image.
2. **No attacker-controlled input.** The vulnerability triggers on a malicious *glob
   pattern*. Every glob in this project is authored by us in `eslint.config.mjs`,
   `vitest*.config.ts`, and `package.json` scripts. A student's submission is source code
   handed to a sandboxed container — it never becomes a lint glob.
3. **No fix exists on the required major.** `minimatch@3` requires `brace-expansion@^1`,
   and `1.1.16` is the newest 1.x. The advisory is only fixed in `5.0.8`, whose export
   shape is incompatible with `minimatch@3` — pinning it there crashes ESLint outright
   (`TypeError: expand is not a function`), which we verified.
4. **The alternative is worse.** `npm audit fix --force` resolves this by installing
   `next@9.3.3` — a seven-major downgrade of the web framework. Trading a dev-only DoS for
   a 2020-era Next.js is a strictly larger security regression.

**What we did fix instead.** Scoped `overrides` in `package.json` patch every advisory that
*could* be reached, taking the count from 12 to 9:

| Package | Pinned to | Why it mattered |
|---|---|---|
| `postcss` | `^8.5.24` | Path traversal / arbitrary `.map` file disclosure via `sourceMappingURL`. Runs at build time on CSS we process. |
| `sharp` | `^0.35.3` | Inherited libvips CVEs (2026-33327/33328/35590/35591). Reachable through Next.js image optimization at runtime. |
| `brace-expansion` (under `minimatch@10`) | `^5.0.8` | The modern chain takes the real fix. |
| `brace-expansion` (under `minimatch@3`) | `^1.1.16` | Newest compatible 1.x — accepted above. |

**Revisit when:** ESLint drops `minimatch@3`, or a `1.1.17` backport ships. Re-run
`npm audit` at every dependency bump; this entry is only valid while the chain above holds.

---

## Security review — 2026-07-30

Full-tree review after the team-scoring, auth, and language-registry work. Threat model: student
submissions are untrusted code executed in Docker; students are motivated to read hidden test data,
read another set's problems, read another student's submissions, inflate a score, or take over an
organizer account.

**Four findings at CRITICAL or HIGH. All four are fixed** — none is accepted. The fixes are below so
that the reasoning survives, not because anything is outstanding.

### C1 — Postgres and Redis were published to the LAN, with a committed password *(fixed)*

`docker-compose.yml` published `5432:5432` and `6379:6379` on all interfaces. The Postgres password
was a literal in the committed file, and Redis had **no password at all**.

Any student on the classroom wifi could connect with a credential read out of the repo: edit
`Submission.score`, read every competitor's source, read `User.passwordHash`, or insert an `ADMIN`
`Session` row with a token of their choosing. Redis was worse — the judge queue lives there, and
`resolveTestDataPath` accepts absolute paths, so a hand-pushed job could read an arbitrary file off
the judge host and return it in the job result.

This defeated every authorization control in `app/api/**` at once.

**Fixed:** both services bind to `127.0.0.1` only — `web` and `worker` reach them over the compose
network by service name, so nothing legitimate used the published port. `POSTGRES_PASSWORD` and a
new `REDIS_PASSWORD` come from `.env` and are required (`${VAR:?...}`), and Redis runs with
`--requirepass`. `ADMIN_PASSCODE` is now passed to the `web` service too, which it never was — so a
composed deployment previously had no organizer sign-in at all.

### H2 — A submission could forge its own timing and turn a TLE into an AC *(fixed)*

`/out` is bind-mounted read-write so the driver can return results, and the student's program runs
as the same uid as the driver in the same container. `.meta` carries the exit code and duration the
host trusts.

A slow-but-correct solution could finish inside the in-container `timeout` (3× the limit) while
exceeding the problem's limit, fork a detached loop rewriting every `.meta` with `0 5 0`, and be
read by the host as "exit 0, 5 ms" — scoring **AC** on its real output. `--pids-limit` permits the
fork, and `timeout` waits only on its direct child, so the orphan outlives the program.

The batch driver's own comment asserted that scribbling on `/out` "buys it nothing, because expected
outputs are never mounted". True of the answers, false of the timings.

**Fixed:** `selfReportedTimingIsCredible` cross-checks the claimed total against `batch.durationMs`,
which comes from the Docker daemon's `State.StartedAt`/`FinishedAt` — outside the container and
unreachable from inside it. When the claim cannot account for the container's lifetime, the batch's
self-reported timings are discarded and every test in it is treated as having hit the wall clock.
The threshold is deliberately lax (orders of magnitude, not percentages) because a false positive
fails a student who did nothing wrong.

### H3 — Hidden test *inputs* were readable and exfiltratable 199 bytes at a time *(fixed)*

Every test's input was written into the bind-mounted `/in` before the container started. `/in` is
read-only but it is *readable*, and the program runs as the same uid as the driver.

Expected outputs are never mounted, and hidden tests correctly produce no diff snippet — both
verified. The leak was indirect: for a **sample** test the snippet legitimately contains the
student's own stdout or stderr, and the student chooses those bytes. So
`sys.stderr.write(open('/in/7.in').read()[k:k+199])` on a sample returns 199 bytes of hidden test
7's input in a field the API is supposed to show them. Repeat, shift `k`, reconstruct the hidden
inputs, compute the answers offline, hardcode.

**Fixed:** inputs are now fed **one at a time**. Only test 1's input exists when the container
starts; `feedInputs` watches for each `<n>.meta` — which the driver writes only after test *n* has
exited — then deletes that input and places the next. At any instant `/in` holds at most one test
input: the one currently being fed to the program on stdin, which it is entitled to see. There is
nothing to read ahead to and nothing to go back for. The driver waits for its input with a bounded
poll, so a dead feeder degrades to the existing missing-`.meta` retry path rather than hanging.

### H4 — Every rate limiter was bypassable with a spoofed header *(fixed)*

`clientKey` read `x-forwarded-for` unconditionally, justified in a comment by "behind the LAN's
single reverse proxy". **There is no reverse proxy** — compose publishes `web` directly and there is
no middleware. So the header was attacker-controlled input, and a different value per request meant
a fresh bucket per request. The organizer passcode — a human-chosen shared secret whose only
protection was that limiter — could be brute-forced without limit.

**Fixed, in three parts, because a single fix would have broken the contest:**

1. `clientKey` honours `x-forwarded-for` only when `TRUSTED_PROXY_COUNT` says a proxy exists, and
   then reads from the right-hand end of the chain rather than the client-controlled left.
2. Credential paths (organizer passcode, email/password) moved from a counter to
   **`CredentialBackoff`** — a growing delay rather than a refusal. A hard shared limit would have
   let a student burn the organizer's ten attempts on purpose and lock the console mid-contest;
   delay makes guessing infeasible while never shutting a real organizer out.
3. Joining is no longer rate limited on the way in — forty students joining in two minutes is the
   normal case, and a shared bucket would have refused most of them. Only a **wrong** join code
   consumes a budget, which is the behaviour actually worth limiting.

---

## Accepted findings from the same review

These were reported and are **not** being fixed. Each is a decision.

### A2 — A submission can fill the judge host's disk through `/out` (medium, **no longer accepted — fixed**)

**Superseded.** This was accepted as "a denial of service against ourselves, and loud". That
reasoning held for a dedicated judge host. The deployment is now a shared 2 vCPU / 4 GB droplet
running Postgres, Redis, the web app and the judge together, where a full disk stops Postgres
accepting writes — so it is a denial of service against the contest, and it is silent until
everything fails at once.

**Fixed** with `--ulimit fsize` (bounds one file, kernel-enforced) plus a host-side watchdog on the
writable mount (bounds their sum). Both were needed: `RLIMIT_FSIZE` says nothing about how many
files there are.

Worth recording, because reasoning would not have found any of them:

- The obvious watchdog is starved by the thing it watches. Summing `stat().size` over a directory
  under a write storm resolved **once in 5.7 seconds**. It now counts entries first.
- **The retry path had no bound, and the attack leads into it.** Filling `/out` kills the batch
  container, which produces no `.meta`, which is what triggers the single-test retry. Measured: the
  batch contained to 268 MB, the retry then wrote 8.6 GB.
- `fsize` is a sixth axis on which compile limits must differ from run limits.

Coverage: `fixtures/sandbox/cases/disk-fill-out`. G5 18/18, G4 57/57, G13 20/20. See `docs/TODO.md`
T4.

The original acceptance follows, kept because what changed is the deployment rather than the code:



`--memory`, `--pids-limit`, `--cpus` and the tmpfs size cap all apply to a submission; none of them
bounds writes to a bind-mounted host directory, so `open('/out/x','w').write('A' * 10**10)` consumes
host disk. The `PTCN_CAP` truncation bounds only what the *driver* copies out; the program reaches
`/out` directly.

**Why accepted for now:** it is a denial of service against ourselves, not a disclosure or a score
change, and it is loud — the judge host runs out of disk and an organizer notices immediately. The
clean fix is `--ulimit fsize=` in the isolation flags, which is a one-line change but needs its own
G5 fixture and a re-run to prove it does not break a legitimate large answer (`cut-the-sticks`
writes 1.29 MB, and a cap sized wrong reports WA on correct code — a mistake this project has
already made once).

**Tracked in `docs/TODO.md`.** Fix before a contest where the judge host also holds anything else.

### A3 — Re-joining re-rolls the problem-set assignment (medium, **no longer accepted — fixed**)

**Superseded.** This was accepted on the reasoning below; the organizer has since ruled that a
student who rejoins until they like their set defeats the contest format, which makes it a cheating
vector rather than a leak to be tolerated.

**Fixed** with a signed, `HttpOnly` join-claim cookie that makes joining idempotent per browser: a
rejoin returns the same participant and the same stored `chosenSetId`, and a second name from a
browser that has already joined is refused and audit-logged. The claim is HMAC-signed because an
unauthenticated participant pointer would be a straightforward account takeover — a student sees
their own id in every response.

Residual, unchanged and deliberate: clearing cookies or a private window still creates a second
participant, and sign-out releases the claim so a shared classroom laptop is not bricked. The
complete fix remains an organizer-issued roster. See `docs/TODO.md` T5 and
`tests/e2e/rejoin.api.spec.ts`.

The original acceptance, kept because the reasoning is what changed:



`joinContest` creates a new `Participant` per call, and a fresh participant has no team, so
`assignSetForOne` effectively draws a fresh random set. A student can join as "x1", note their set,
read it, then join as "x2" and get a different one — reading the whole room's Round 1 in a handful
of joins.

**Why accepted for now:** the fix is a roster policy question rather than a code question — should a
join be bound to a session, an account, or an organizer-issued allowlist? — and answering it wrong
locks out a student whose browser lost a cookie, on the night, which is worse than the leak. The
`JOIN_FAILURE_RULE` limiter does not help here because these joins *succeed*.

**Operational mitigation until it is fixed:** every join is audit-logged with its assigned set, and
duplicate participants are visible in the admin roster. An organizer watching the participant list
will see "x1, x2, x3" from one student.

**Tracked in `docs/TODO.md`.**

### A4 — `lib/contest/set-assignment.ts` was invisible to diff review (medium, fixed)

The file contained a literal NUL byte in a sentinel string, so git classified it as binary and
`git diff` reported only `Bin 0 -> 7714 bytes`. **A diff-based review would not have seen a single
line of the file that decides which problems a competitor may read.** Not a runtime vulnerability —
no cuid can contain NUL — but a hole in the review process itself.

**Fixed:** the sentinel is now an ordinary string.

### A5 — No server-side gate on the `/admin` route group (low, accepted)

`app/(admin)/layout.tsx` renders without checking for an admin viewer and there is no middleware.
Impact today is nil: every page under it renders from stub data, and the real data comes from
`app/api/admin/**`, all of which call `requireAdmin`.

**Why accepted:** adding a layout-level check now would be a second authorization mechanism to keep
in sync with the one that actually enforces anything. **The risk is future, not present** — the
first admin page that becomes a server component with a Prisma read inherits no protection.

**Tracked in `docs/TODO.md`** with that trigger stated explicitly.

### A6 — `/out` and `/build` mount permissions are untested on Linux (low, accepted)

Scratch directories are created with `mkdtemp`/`mkdir` and never `chmod`ed, while the container runs
as `--user=65534`. On this macOS host the file-sharing layer makes the writes succeed. On the
dedicated Linux host `docs/HOSTING.md` recommends, uid 65534 may not be able to write into a
directory owned by the worker user, and **every submission would fail**.

**Why accepted:** it is a portability bug, not a vulnerability, and it fails loudly and immediately
rather than silently. It is called out here because the obvious field fix — `chmod 777`, or dropping
`--user` — makes A2 and H2 strictly worse. Fix it with a targeted `chmod` on the result directory
only.

**Tracked in `docs/TODO.md`, flagged for the host migration.**

### A7 — Auth E2E coverage disappears silently without `ADMIN_PASSCODE` (low, accepted)

Session-revocation and admin-authorization specs `test.skip` when the env var is unset, so a green
G7 does not prove they ran.

**Why accepted:** the alternative is a suite that cannot run at all on a fresh clone, which is worse
for the student maintainer this project is written for. `scripts/verify.sh` prints the precondition,
and `npm run verify` on a configured machine does run them.
