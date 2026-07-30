# TODO

Genuine gaps, recorded rather than papered over. Per `docs/KICKOFF.md`: anything incomplete goes here
and its gate stays FAIL — no stubbing a function to satisfy a type, no weakening a test to get green.

Ordered by consequence, not by effort.

**Read this before trusting a feature.** Several things below are built and tested but not reachable,
and a couple are reachable but wrong on this hardware.

---

## The short version

| # | What | Severity |
|---|---|---|
| T1 | Hints have no content — **deferred**, and the UI no longer offers to sell one | blocker for hints only |
| T2 | Java time limits are unenforceable on a slow host — a *scoring* error, not a speed one | **high** |
| T3 | Verdict latency tracks host load — G8 passes at load 4, fails 28× at load 32 | medium, hardware |
| T4 | ~~A submission can fill the judge host's disk~~ **fixed** | resolved |
| T5 | ~~Re-joining re-rolls the problem set, leaking other sets~~ **fixed**; one residual stated | low |
| T6 | Monaco is specified but not installed | medium |
| T7 | Team management and awards UI are missing | medium |
| T8 | `/admin` has no server-side gate — future risk, not present | low |
| T9 | Mount permissions untested on Linux — will bite on the host migration | low |
| T10 | `isGroupProblem` still shadows `round` | low |
| T11 | Contract gaps in `lib/schemas/api.ts` | low |

---

## T1 — Hints have no content. **DEFERRED, and the UI no longer offers one.**

**Severity: high for the hint feature, and it blocks nothing else.** Deferred deliberately for the
demo deployment: the contest works without hints, and shipping a purchase that returns nothing is
worse than shipping no purchase.

**The hint economy is specified and implemented; hint CONTENT is neither.** The ledger, the
pricing, the balance and the earn rule all work. What does not exist is the thing being bought.

**What changed for the deferral:** `components/contest/hints/HintPanel.tsx` no longer renders a
"Take a hint" button or the confirm flow. It used to offer the purchase and then say "ask an
organizer; the platform cannot show it yet" — honest about the outcome, and it still took 15% of
the problem's points. **No UI now offers a hint it cannot deliver.** The balance figures remain
where the API supplies them, because "you have earned two hints" is true and useful; where it does
not, the panel says hints are unavailable in plain words rather than showing an error a student
would retry.

The API side already refused: `httpContestApi.getHintBalance` and `takeHint` both reject with
`NOT_IMPLEMENTED`, and `UNIMPLEMENTED_ROUTES` in `lib/schemas/api.ts` records that no hint route
exists. So the deferral holds at both layers, not just in the component.

**Restoring it is small** — put the confirm flow back and render the returned text — but the PRD
decision has to come first. Everything below is what that decision needs to cover.

This is a hole in `docs/PRD.md`, not just in the implementation.

The PRD specifies the hint *economy* precisely — §6.3: two CodingBat warmups earn one hint, each hint
deducts 15% of a group problem's base points, and the ledger is tracked by the platform rather than
by an organizer with a clipboard. §9.1 requires the UI to show the balance and the next hint's cost
*before* the student commits.

Nothing in the PRD, the domain model (§5), or `prisma/schema.prisma` says what a hint **is**.
`HintGrant` records `participantId`, `contestProblemId`, `hintIndex`, `grantedAt` and `costPaidRef` —
that a hint was taken and what it cost. There is no field anywhere that holds hint *text*, and no way
for an organizer to author one.

As it stands a student can spend 15% of a problem's points and the platform has nothing to show them.
The competitor UI currently says so out loud, which is the only honest thing it can do.

**Proposed fix** (needs an organizer decision on wording, not just code):

```prisma
model Hint {
  id        String  @id @default(cuid())
  problemId String
  ordinal   Int     // 1..3; matches HintGrant.hintIndex
  text      String  // markdown
  problem   Problem @relation(fields: [problemId], references: [id], onDelete: Cascade)
  @@unique([problemId, ordinal])
}
```

plus `hintText` on the hint-purchase response, and authoring UI in the admin problem editor.

**Gate impact:** the hint flow cannot be exercised end to end, so any G7 spec covering hints stays
FAIL until this is resolved.

---

## T2 — Java time limits are unenforceable on this host **(a correctness problem, not a speed one)**

**Severity: high**, and it is the one item here that can change who wins.

`jdk21.startupBudgetMs` is 45,000 ms, because one measured full-path sample of a trivial Java program
took **38,473 ms**. The budget has to cover it — a budget below real startup fails correct solutions
as TLE, which this project has already done twice.

The consequence is that a **2-second Java problem effectively allows 49 seconds**
(`2,000 × 2 + 45,000`). `TLE` is not reachable for Java. A deliberately quadratic Java solution
passes, while the same idea in Python is caught by an 8,000 ms effective limit.

So the same wrong answer is accepted in one language and rejected in another, and nothing on the
leaderboard shows why.

**Not fixable in software here.** Lowering the budget fails correct code, which is worse. The budget
is right for this host; the host is wrong. Full analysis — what host fixes it, and what to do if the
contest must run on this one anyway — is `docs/HOSTING.md` §5.

---

## T3 — Verdict latency depends on how busy the host is, and G8 passes only on a quiet one

**Severity: medium, downgraded from high.** The threshold was never lowered; the machine got
quieter.

Same code, four measurements, against a 10,000 ms target:

| Host load | p95 | |
|---|---|---|
| **4.25** | **7,363 ms** / 7,476 ms | **PASS**, reproducible back to back |
| ~8 | 110,767 ms | FAIL, 11× |
| 32 | 283,436 ms | FAIL, 28× |

**A green G8 here means the machine was quiet, not that the platform is fast.** The spread is 38×
on identical code, because container creation dominates and degrades with load — 2.4–16 s against
a 1.0 s per-container budget.

**Correctness never varied**: 40/40 accepted, 40/40 `AC`, zero `IE`, zero dropped, on every run
including the slowest. Students get the right verdict; on a busy host they wait for it.

**Still open**, because 2.6 s of headroom at load 4 is not margin for a contest night, and because
the deployment target is a 2 vCPU droplet shared with Postgres, Redis and the web app. The fix is
the host, not the code — `docs/HOSTING.md` §6 for the recommendation and §7 for the ten-minute
re-measurement to run on whatever machine the contest actually uses.

---

## T4 — A submission can fill the judge host's disk through `/out` — **fixed**

**Was: medium**, accepted as A2 in the 2026-07-30 security review. Raised and fixed because the
deployment is now a shared 2 vCPU / 4 GB droplet: a full disk there stops Postgres accepting
writes, so this stopped being "denial of service against the judge" and became "denial of service
against the contest".

`--memory`, `--pids-limit`, `--cpus` and the tmpfs cap all bound a submission; none of them bounded
a write to a bind-mounted host directory, and the program runs as the same uid as the driver.

**Fixed with two bounds, because one is not enough:**

| Bound | Stops | Enforced by |
|---|---|---|
| `--ulimit fsize` = the container's tmpfs size | one enormous file | the kernel |
| A host-side watchdog on the writable mount — file count, then byte total | many ordinary files | `docker kill` |

`RLIMIT_FSIZE` bounds a file, not their sum, so `for i in range(100000): open(f'/out/{i}','w')`
walks straight past it. Hence the watchdog.

**Three things this took that were not obvious, all found by running it rather than reasoning
about it:**

1. **The naive watchdog — sum `stat().size` over the directory — does not work.** Against a
   program creating files as fast as it can, each poll's `stat` storm outlasts the poll interval:
   measured, **exactly one poll in 5.7 seconds ever resolved**. The count is now checked first with
   a bare `readdir` (~2 ms on 4 000 entries), and bytes are only summed for a directory already
   known to be small.
2. **The retry path had no bound at all, and the disk-fill path leads directly into it.** Filling
   `/out` gets the batch container killed, which means no `.meta`, which is exactly the condition
   that triggers `runSingleTest`. Measured: the batch was correctly contained to 268 MB and the
   retry then wrote **8.6 GB**. A fix on one path was worth nothing.
3. **`fsize` is a sixth axis on which compile limits differ from run limits.** Inherited from the
   run container it would cap `javac` and `go build` at a size chosen for a student's program, and
   the student sees CE on code that compiles fine — the exact failure the other five axes have
   each caused here before.

**Residual:** the kill is not instantaneous, so a submission writing at full speed lands roughly
one poll interval plus kill latency of data — ~100 MB per container at the current 100 ms, ~400 MB
with four workers. Bounded and transient; the directory is removed when the job ends.

Coverage: `fixtures/sandbox/cases/disk-fill-out`, which probes **`/out`** — the one writable mount,
which no previous fixture touched. The four `write-outside-tmp` cases all probe read-only paths, so
they proved the rootfs and left this surface uncovered. G5 18/18, and G4 57/57 plus G13 20/20 to
show the caps do not fail legitimate output (`cut-the-sticks` writes 1.29 MB).

---

## T5 — Re-joining re-rolls the problem-set assignment — **fixed, with one stated residual**

**Was: medium.** Security review A3. The re-roll itself is closed; read the residual before
assuming the vector is gone entirely.

`joinContest` created a `Participant` on every call, and a fresh participant drew a fresh set. Join
as "x1", read set A; join as "x2", read set B. A handful of joins read the whole room's Round 1
before it started, and the join-failure limiter never saw it because every one of those joins
*succeeded*.

**Fixed** by making a join idempotent per browser, using a signed **join claim** cookie
(`lib/contest/join-claim.ts`):

- A browser presenting a valid claim is handed **the same participant and the same
  `chosenSetId`**, which is read as stored and never recomputed. There is no second draw to win.
- A browser holding a claim cannot join under a *different* name; the attempt is refused and
  audit-logged as `participant.rejoin_refused`, so it shows up in the roster rather than nowhere.
- The claim is HMAC-signed with `SESSION_SECRET`. Unsigned it would be worse than nothing — a
  student sees their own participant id in every response, so an unauthenticated pointer would let
  anyone become anyone by pasting one in.
- Every rejoin writes `participant.rejoin` carrying the set it returned. Recorded on *every*
  rejoin, not just the first, so a set that did change would be visible rather than deniable.

It also closes a lockout that was there before: the claim deliberately outlives the session, so a
student whose session cookie was dropped gets back to **their own** participant instead of the
`CONFLICT` that used to lock them out of their own submissions mid-contest.

Coverage: `tests/e2e/rejoin.api.spec.ts` (12 specs — 10 consecutive rejoins return an identical
set, ten rejoins create exactly one row, forged claims in four shapes are refused, and every
competitor route is enumerated against an unassigned set), plus `lib/contest/join-claim.test.ts`
and the idempotency block in `lib/contest/set-assignment.test.ts`.

**Residual, stated rather than hidden: clearing cookies or opening a private window still creates a
second participant.** Sign-out releases the claim on purpose — a shared classroom laptop must not
be bricked for the next student — so sign-out-then-join is also a second draw. What this changes is
the cost: sampling now requires clearing site data between every attempt and leaves "x1, x2, x3" in
the roster with an audit row each. **The complete fix is an organizer-issued roster allowlist**,
which is a policy decision rather than a code one and is not made here.

While fixing this: the wrong-join-code limiter was consuming its budget on *every* join failure,
including ordinary conflicts. The bucket is a single shared 20-per-5-minutes for the whole room, so
twenty honest conflicts could have stopped forty students from joining at all. It now consumes only
on `NOT_FOUND`, which is the wrong-code case.

---

## T6 — Monaco is specified but not installed

**Severity: medium**, downgraded from high now that internet is guaranteed (PRD §10.1).

`docs/PRD.md` §10 mandates Monaco, lazy-loaded. The competitor UI ships a hand-written editor that is
keyboard-complete (line numbers, Tab-to-indent, block indent/dedent, auto-indent, Ctrl/Cmd+Enter) but
has no syntax highlighting. It is already lazy-loaded into its own chunk and `CodeEditorProps` is the
seam, so no call site moves when Monaco lands.

`@monaco-editor/react` loads `vs/` from jsDelivr by default. That is now *permitted* — but vendoring
it under `public/` and pointing `loader.config({ paths: { vs: "/monaco/vs" } })` at it is still
preferable, for a reason unrelated to the venue: it is a runtime dependency on the single most
important screen in the application. If jsDelivr is slow, a student cannot type.

---

## T7 — Team management and awards UI are missing

**Severity: medium.** The APIs exist and are tested; two screens do not.

| Screen | State |
|---|---|
| Team leaderboard, expandable breakdown | done |
| Projector team board | done |
| My team (`/team`) | done |
| Admin side-activity entry | done |
| **Team management** — create teams, assign participants, see sizes | **missing** |
| **Awards screen** — still renders the per-division individual board | **stale** |

Team management is the consequential one. **Team size is the divisor in every team score**, so a
roster is a scoring input rather than an administrative convenience — and it can currently only be
edited with SQL. `MyTeamView` and the team board both flag a team of one, which is the usual symptom,
but nothing lets an organizer fix it.

---

## T8 — No server-side gate on the `/admin` route group

**Severity: low today, and a trap tomorrow.** Security review A5.

`app/(admin)/layout.tsx` renders without checking for an admin viewer, and there is no middleware.
Impact right now is nil: every page under it renders from `components/admin/stub-data`, and the real
data comes from `app/api/admin/**`, all of which call `requireAdmin`.

**The trigger to watch for:** the first admin page that becomes a server component with a Prisma read
inherits no protection at all. If you are about to write one, add the gate first.

---

## T9 — `/out` and `/build` mount permissions are untested on Linux

**Severity: low, and it will bite on the host migration.** Security review A6.

Scratch directories are created with `mkdtemp`/`mkdir` and never `chmod`ed, while the container runs
as `--user=65534`. On this macOS host Docker Desktop's file-sharing layer makes the writes succeed.
On the dedicated Linux box `docs/HOSTING.md` recommends, uid 65534 may not be able to write into a
directory owned by the worker user, and **every submission fails**.

**Fix it with a targeted `chmod` on the result directory only.** The obvious field fix — `chmod 777`,
or dropping `--user` — makes T4 and the timing-forgery class strictly worse.

Related, same area: `worker/index.ts` running inside a compose container passes container-local paths
to the *host* daemon over the mounted socket, so those bind mounts resolve to empty host directories.
The isolation posture G4 and G5 exercise (worker on the host) is not the one `docker compose up`
produces. Worth resolving before anyone relies on the composed worker.

---

## T10 — `Problem.isGroupProblem` is still present alongside `round`

**Severity: low, but it is two sources of truth for one fact.**

`round` (`INDIVIDUAL` | `GROUP`) supersedes the boolean, which could not express "individual, on set
A" as distinct from "individual, on no set". The migration backfilled `round` from it and
**deliberately left the column**: dropping a column in the same migration that starts reading its
replacement leaves no way back if the backfill is wrong.

The backfill is now verified — 3 GROUP, 125 INDIVIDUAL, 0 mismatches — so the column can go. The
scoring engine and the problem routes already read `round`; the remaining readers are
`lib/seed/merge.ts`, `lib/schemas/api.ts`, and the competitor components.

---

## T11 — Contract gaps in `lib/schemas/api.ts`

**Severity: low.** Found during the frontend work and still open.

| Gap | Consequence today |
|---|---|
| No `sourceCode` on `SubmissionView` | PRD §9.1 wants "full history with code". Older submissions render "not available". |
| No problem title/slot on `SubmissionView` | History makes a second `listProblems()` call and joins client-side. |
| No contest-metadata shape (name, `startsAt`, state) | The lobby fetches *standings* just to read the clock off `endsAt`. |
| `SSE_EVENTS.contestState` declared with no payload schema | Event name exists, shape does not. |
| No `testCaseCount` on `ProblemDetail` | The verdict panel cannot say "3 of 12" while judging. |

---

## Resolved, kept for the reasoning

- **Startup budgets** — all five are measured through the **full judge path** under churn, and
  `WORST_OBSERVED_MS` in `worker/runner.test.ts` pins them so a budget cannot be lowered below a
  value actually observed. The lesson recorded in `lib/judge/runtimes.ts`: the two measurement
  methods disagree by up to 5× **in both directions**, so a budget is a multiple of the worst
  observation and never a fit to a median. Java's remains a live problem — T2.
- **Auth over HTTP** — all four sign-in paths are reachable and covered by G7: join code, organizer
  passcode, email/password, Google and GitHub.
- **Set visibility** — enforced in the API on the list, detail and submission paths, with G7
  coverage. Previously `canReadSet` existed and nothing called it.
- **Set assignment** — seeded, stored, audit-logged, and re-derivable through an admin endpoint, so
  a disputed assignment can be shown rather than argued about.
- **Four security findings at CRITICAL/HIGH** — data services published to the LAN, forged
  submission timings, hidden test inputs exfiltratable through sample diffs, and rate limiters
  bypassable with a spoofed header. All fixed; see `SECURITY.md`.
- **G5** — 17/17, 13 hostile fixtures across four runtimes.
- **G9 on the team screens** — including the projector board the room reads for an hour. Two real
  defects fixed: a wrapper `opacity-60` muting text in the admin header, and `/team` rendering no
  heading in three of its four states.
- **`npm run lint` linting agent worktrees** — resolved when the worktrees were removed.
  `fixtures/**` stays excluded on purpose: the CE fixtures do not parse and the TLE fixtures are
  infinite loops, so every finding there is a fixture working correctly.
