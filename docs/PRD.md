# Park Tudor Coding Night — Product Requirements Document

**Version:** 1.0
**Status:** Ready for implementation
**Owner:** Coding Night organizers, Park Tudor School
**Audience:** Claude Code (implementing agent) + future student maintainers

---

## 1. Problem statement

Coding Night currently runs on HackerRank. HackerRank judges submissions, but it does not
model the way Coding Night actually scores a night:

- Results have to be exported and re-keyed into a spreadsheet.
- **HackerRank cannot score a team contest at all.** It ranks individuals on identical problem
  sets; Coding Night runs players on *different* sets, then totals each team and divides by team
  size. That single mismatch is what forces the spreadsheet.
- Per-player problem sets, partial credit, group rounds, non-coding side activities, and the
  CodingBat-for-hints mechanic are all reconciled by hand.
- The winner is computed manually, after everyone has gone home, which kills the moment.
- Past problem history lives in one fragile spreadsheet (`Problems_List.xlsx`), so
  organizers re-pick problems that were already used or that nobody could solve.

**The organizers spend the event doing data entry instead of running the event.**

## 2. What we are building

A self-hosted Park Tudor Coding Night web platform that:

1. Hosts contests with problems, sample cases, and hidden test cases.
2. Judges submissions in ten languages automatically in a sandbox (§7.3), with real verdicts
   (Accepted / Wrong Answer / Time Limit Exceeded / Memory Limit Exceeded / Runtime Error /
   Compile Error) and per-test detail.
3. Scores every submission the instant it lands, using the Coding Night rules — **team scoring
   normalised by team size**, parallel problem sets, difficulty weights, partial credit,
   penalties, hint costs, group rounds, and admin-entered side activities.
4. Shows a live **team** leaderboard on the projector and declares a winner the second the clock
   hits zero, with zero spreadsheet work.
5. Keeps a permanent problem bank so organizers can see what has been used, what was
   solved, and what nobody has ever cracked.

## 3. Success criteria

The project is done when, on a real Coding Night:

| # | Criterion | Measurement |
|---|-----------|-------------|
| S1 | No manual tallying | Organizer performs zero spreadsheet edits from start to awards |
| S2 | Winner is instant | Final standings render within 5 seconds of contest end |
| S3 | Judging is trustworthy | 100% agreement with reference verdicts on the fixture suite (Gate G4) |
| S4 | Nothing escapes the sandbox | All hostile-submission fixtures contained (Gate G5) |
| S5 | Setup is one command | `docker compose up` on a clean clone produces a working, seeded instance |
| S6 | A student can run it next year | A new organizer can create and run a contest using only the admin UI and README |

## 4. Users and roles

| Role | Who | Can do |
|------|-----|--------|
| **Competitor** | Park Tudor students | Join a contest with a code, read problems, submit code, see own verdicts, see leaderboard, request hints |
| **Organizer / Admin** | Faculty sponsor, student officers | Create contests, author problems + test cases, assign divisions, start/stop/freeze, override verdicts, export results |
| **Spectator / Projector** | Anyone in the room | Read-only full-screen live leaderboard, no login |

Auth: **three providers** — Google, GitHub, and email/password — plus admin-issued join codes as
an operational fallback. Sessions are server-side rows in Postgres, never self-contained JWTs, so
an organizer can **revoke a session mid-contest** and so a redeploy does not sign the room out.
See §10 and `docs/AUTH.md`.

Competitors are also **team members**: a participant belongs to exactly one team, and the team is
what gets ranked.

## 5. Core domain model

**The contest is team-based.** This is the reason HackerRank forced a spreadsheet: it scores
individuals on identical problem sets, and cannot total across different people working different
problems and then normalise by team size.

```
User            id, email, displayName, role, gradYear, passwordHash, googleSub?, githubSub?
Session         id, tokenHash, role, method, participantId?, contestId?, userId?,
                expiresAt, revokedAt, revokedReason, lastSeenAt
Contest         id, name, startsAt, endsAt, freezeAt, state, scoringPresetId, joinCode,
                setAssignmentSeed, config (see §6.4)
Division        id, contestId, name, sortOrder            -- OPTIONAL; a contest may have none
Team            id, contestId, name                       -- members via Participant.teamId
ProblemSet      id, contestId, label ("A".."D")           -- problems via ContestProblem.setId
Problem         id, slug, title, statementMd, inputSpec, outputSpec, constraints,
                difficulty (E|M|H), round (INDIVIDUAL|GROUP), timeLimitMs, memoryLimitMb,
                allowedLanguages[], referenceSolution, originAttribution, tags[]
TestCase        id, problemId, ordinal, input, expectedOutput, isSample, points, group
ContestProblem  contestId, problemId, setId?, divisionId?, slotLabel, basePoints, unlockAt
Participant     id, contestId, userId?, displayName, teamId, chosenSetId?, divisionId?
Submission      id, participantId, contestProblemId, language, sourceCode, submittedAt,
                verdict, score, runtimeMs, memoryKb, judgedAt, judgeLogRef
TestResult      submissionId, testCaseId, verdict, runtimeMs, memoryKb, diffSnippet
HintGrant       id, participantId, contestProblemId, hintIndex, grantedAt, costPaidRef
TeamSideActivity id, teamId, label, points, enteredBy, enteredAt   -- admin-only, audit-logged
Standing        (materialized) teamId, score, rank, plus per-participant breakdown
AuditLog        actor, action, entity, before, after, at
```

Problem statements are stored as Markdown with KaTeX math support. Test data is stored as
files on disk (referenced by the DB), not as giant DB blobs, so large cases stay cheap.

`Division` is now optional. The team dimension replaced it as the primary axis, and a contest
that groups by team does not necessarily also split by skill level.

### 5.1 Contest shape

**Round 1 — 45 minutes, individual, parallel problem sets.**
Sets are labelled A, B, C, D. Each set holds one Easy, one Medium and one Hard problem, and the
sets are calibrated to be of equal difficulty so that which set a player gets does not change what
their points are worth.

A set is assigned to a **player**, not to a team — so a team of four is typically working four
different sets at once. `Participant.chosenSetId` records the assignment.

**Round 2 — group.** Two harder problems solved by the team together. One submission counts for
the whole team.

**Side activities.** Non-coding: a metal puzzle, train tracks, Connections. An organizer enters
points per team; there is no submission and nothing to judge.

## 6. Scoring engine (this is the part that replaces the spreadsheet)

Scoring must be a **pure, deterministic, unit-tested function**:

```
score(contestConfig, submissions[], hintGrants[], sideActivities[], teams[]) -> Standing[]
```

No scoring logic anywhere else in the codebase. The API and UI read its output only.

### 6.1 Team score — the formula

```
teamScore = (sum of ALL player points, group problems included) / teamSize
            + sideActivityPoints
```

The divisor is the team's **actual** size, which is what makes uneven teams (2 to 5 players)
comparable. Group problem points sit **inside** the mean, treated exactly like individual problem
points. Side activity points are added **flat**, not divided.

**Worked example**, from a real scoring sheet. Players score 400, 250, 400 and 400; the team
solves one 125-point group problem; side activities award 20 + 80 + 50.

```
individual sum   400 + 250 + 400 + 400  = 1450
group points                            =  125
team size                               =    4
side activities  20 + 80 + 50           =  150

teamScore = (1450 + 125) / 4 + 150
          = 1575 / 4 + 150
          = 393.75 + 150
          = 543.75
```

**The sheet itself produced 512.5**, which is `1450 / 4 + 150` — it dropped the group points
entirely. That is a spreadsheet error, and eliminating exactly this class of error is why this
platform exists. It is pinned in `fixtures/expected-standings.json` as a **named wrong answer**
with a test asserting we do not reproduce it. See `docs/SCORING.md`.

### 6.2 Problem set assignment

Sets are **randomly assigned, never previewed and chosen.** A player does not see the other sets
before assignment.

- **Seeded and reproducible.** `Contest.setAssignmentSeed` is stored, so any assignment can be
  re-derived from the seed and the participant list. A disputed assignment has to be
  *explainable* rather than argued about.
- **Balanced, not naively random.** Assignment spreads players across sets, so a team of four gets
  four different sets where the set count allows. Naive random would sometimes hand three players
  the same set.
- Every assignment is written to `AuditLog`.
- `config.allowReadingUnassignedSets` (default **false**) controls whether a player may read a set
  they were not assigned. **Enforced in the API, not merely hidden in the UI.**

### 6.3 Per-problem scoring — "Coding Night Classic"

- Each contest problem has `basePoints` derived from difficulty: **E = 100, M = 200, H = 300**
  (organizer-editable per problem).
- **Partial credit:** test cases carry points. A participant's score for a problem is the best
  score any of their submissions achieved. This preserves the spreadsheet's "partially solved".
- **Penalty:** 5 minutes per rejected submission on a problem that is *eventually* scored above
  zero. Rejected submissions on never-scored problems cost nothing.
- **Hints:** each hint taken on a group problem deducts 15% of that problem's base points. Hints
  are earned by solving CodingBat-style warmups — **2 warmups = 1 hint** — and the ledger is
  tracked by the platform, not by an organizer with a clipboard.
- **Ranking is by team:** teamScore DESC → total team penalty ASC → time of last score-increasing
  submission by any member ASC. Any remaining tie is displayed as a genuine tie, never broken
  arbitrarily.

### 6.4 Scoring config flags

Both alternate readings below were open questions, resolved by the organizer in favour of the
defaults. They stay implemented as flags so the decision is reversible without a code change, and
each has its own golden-fixture variant.

| Flag | Default | Alternate | Example result |
|---|---|---|---|
| `groupPointsInsideMean` | `true` — group points inside the per-player mean | `false` — added to the team total after the mean | 543.75 vs 637.50 |
| `sideActivitiesFlat` | `true` — added flat to the team total | `false` — divided by team size | 543.75 vs 431.25 |
| `setSelection` | `RANDOM_ASSIGNED` | `PLAYER_CHOOSES`, `ONE_SET_PER_TEAM` | — |
| `allowReadingUnassignedSets` | `false` | `true` | — |

`setSelection` covers both formats the organizer described: each player independently on their own
set, or one set per team.

### 6.5 Alternate preset — "ICPC"

Binary AC/no-AC, 20-minute penalty per wrong submission on solved problems, rank by solve count
then penalty. Selectable per contest.

### 6.6 Hard requirements

- Recomputing standings from the raw submission log must produce byte-identical output every time
  (idempotent replay).
- **Fractional team scores are exact.** The mean makes non-integer scores normal (543.75), and
  floating point is not acceptable in a scoring engine — this project has already shipped one
  float bug where `3 * 0.15 * 250` produced `112.49999999999999` and cost a student a point.
  Scores are computed in integer hundredths of a point with a documented rounding rule.
- Freeze: after `freezeAt`, the public leaderboard stops updating but judging continues. Admin
  view still shows live truth. Unfreeze reveals the final board dramatically.
- Every score change, side-activity entry and set assignment is written to `AuditLog` so a
  disputed result can be explained.

## 7. The judge (highest-risk component — build it first)

Untrusted student code runs here. It never runs in the web process.

### 7.1 Architecture

```
Browser → POST /api/submissions → enqueue job (Redis/BullMQ)
                                       ↓
                            Judge worker (separate container)
                                       ↓
                     per-submission ephemeral Docker container
                       - no network (--network=none)
                       - read-only rootfs, tmpfs /tmp with size cap
                       - non-root user, --cap-drop=ALL, --security-opt=no-new-privileges
                       - --pids-limit, --memory, --cpus
                       - wall-clock kill = 3× time limit
                                       ↓
                     per-test verdict → aggregate → persist → SSE push
```

### 7.2 Verdict rules

| Verdict | Trigger |
|---------|---------|
| `AC` | stdout matches expected after trailing-whitespace normalization |
| `WA` | mismatch; store a truncated diff snippet (never the full expected output — students must not be able to reconstruct hidden cases by diffing) |
| `TLE` | CPU or wall time exceeds the problem limit |
| `MLE` | RSS exceeds the memory limit |
| `RE` | non-zero exit, signal, or uncaught exception |
| `CE` | compiler exit non-zero; return compiler stderr verbatim to the student |
| `IE` | internal error — never shown as a student-facing failure; auto-requeued once, then paged to admin |

Output comparison is pluggable: exact, whitespace-normalized (default), float-with-epsilon,
and a special-judge hook for problems with multiple valid answers.

### 7.3 Languages

The registry (`lib/judge/runtimes.ts`) has two levels, and the split is the design:

- A **runtime** owns a container image, a *measured* startup budget, and a fixture set.
  Five of them, because there are five images and five things to measure.
- A **variant** is a compile-flag entry on top of a runtime. Ten of them, because that is how
  many choices a student sees in the dropdown.

| Runtime | Image | Variants |
|---|---|---|
| `python312` | `python:3.12-slim` | Python 3.12 |
| `jdk21` | `eclipse-temurin:21-jdk` | Java 8, 11, 17, 21 — `javac --release` selects the level |
| `gcc14` | `gcc:14` | C++11, C++17, C17 — `-std=` selects the standard |
| `node22` | `node:22-slim` | JavaScript (Node 22) |
| `go123` | **`ptcn-go:1.23`, built locally** | Go 1.23 |

Java's four levels share one JVM and therefore one budget; the three GCC standards share one
compiler. Measuring them separately would be measuring the same thing repeatedly and inviting
drift between numbers that describe one runtime.

**Adding C++20 or Rust is a registry line, never a change to `worker/runner.ts`.** If the
runner has to change to add a language, the registry is missing an axis.

Go does not use the stock `golang` image. Since Go 1.20 the standard library is not shipped
pre-compiled, so a fresh container recompiles it on every submission — measured 65.8 s
in-container against 2.5–11.8 s with a pre-warmed cache. `docker/go/Dockerfile` bakes the
cache; **`scripts/build-judge-images.sh` must run on the judge host before the night**, and
its `--verify` mode proves the cache is live. A missed cache is silent: it reports CE on
correct code by exceeding the compile timeout.

Compile limits are separate from run limits on five axes — timeout, memory, pids, tmpfs, and
CPUs. A cgroup has one cap each, so sizing them for the compiler would mean an 800 MB program
is never OOM-killed and MLE detection quietly stops working. Compiled languages therefore get
two containers: a build container at the compiler's limits, then a run container at the
problem's. §7.1's "one ephemeral container per submission" governs the *untrusted program*,
which still gets exactly one.

A `CE` returns the compiler's **verbatim stderr**. The compiler is describing the student's own
code, so nothing about the hidden tests leaks (§7.2), and a paraphrased template error is
useless to them.

`allowedLanguages` is per problem and enforced **in the API on both the judged and the
run-samples path**, not only in the picker. The picker is a hint; anyone can POST anything.

Startup budgets are currently **provisional and Docker-Desktop-sized** — see `docs/HOSTING.md`
§6 step 3 for re-measurement on the real judge host.

### 7.4 Non-negotiables

- A submission cannot read another submission's files, the host filesystem, the database,
  or the network.
- A fork bomb, an infinite loop, a 10 GB allocation, and a `while True: open(...)` loop
  each degrade to a clean verdict and leave the host healthy.
- The queue never loses a job. Worker crash mid-judge → job is retried, not silently dropped.
- Judge throughput target: **40 concurrent submissions, p95 verdict in under 10 seconds**
  (a Coding Night is roughly 20–40 people, everyone submitting near the end).

## 8. Problem content and IP

The past-problems spreadsheet lists HackerRank problem titles. **Do not copy HackerRank
problem statements, editorials, or test data into this platform.** Those are HackerRank's
copyrighted content and republishing them on a school site is a real (if small) legal
exposure and a bad example to set for students.

What the platform does instead:

- The seed file (`problems_seed.csv`) imports **titles and history only**, as a planning
  index. Each imported row is created as a `Problem` in `DRAFT` state with an empty
  statement and an `originAttribution` field noting the HackerRank inspiration.
- Organizers write an **original statement** (own words, own flavor text, own variable
  names) and generate **own test data** via a reference solution + a random-input generator
  before a problem can leave `DRAFT`.
- A problem cannot be added to a live contest while in `DRAFT`. Enforce this in the API,
  not just the UI.
- For problems that are genuinely public-domain classics (Fibonacci, FizzBuzz, magic
  squares), attribution is optional but the statement still gets written fresh.

The imported history is genuinely valuable: 20 titles are marked solved in past contests,
3 partially solved, 9 were used and **nobody scored a single point**, and 15 are untried
candidates. Surface those flags in the problem picker so organizers stop repeating the
"nobody got it" problems.

## 9. Feature requirements

### 9.1 Competitor experience

- **Join:** sign in (Google, GitHub, or email/password) or enter an admin-issued join code → pick
  display name → **be placed on a team** → land in contest lobby.
- **Set assignment:** on Round 1 start the player is *told* which set they were assigned. There is
  no set picker, because sets are randomly assigned and never previewed (§6.2). The lobby shows
  which set they have and why it is fair — equal-difficulty sets, seeded assignment.
- **Contest view:** the player's own set's problems with slot label, difficulty, points, own status
  (unsolved / partial n pts / solved), the group-round problems, and a countdown clock. Problems
  from sets the player was not assigned are **not listed and not readable**, unless
  `config.allowReadingUnassignedSets` is on.
- **Problem view:** statement, constraints, sample I/O with a copy button, language picker, Monaco
  editor with syntax highlighting and Tab-to-indent, "Run samples" (free, no penalty) and "Submit"
  (judged, counts).
- **Verdict panel:** streams live. Per-test rows: sample tests show the diff, hidden tests show
  pass/fail and timing only.
- **Hints:** shows hint balance, warmups solved, and what the next hint costs before the student
  commits to taking it.
- **My team:** team name, members, each member's points, the team's side-activity points, and the
  team total with the arithmetic shown. A student who can see how the mean was computed does not
  need to trust it.
- **My submissions:** full history with code, verdict, and score.

### 9.2 Organizer experience

- **Contest builder:** name, window, teams, problem sets, optional divisions, scoring preset, join
  code, freeze time, and the §6.4 scoring config flags.
- **Team management:** create teams, assign participants, and see team sizes. Since team size is
  the divisor in the score, a wrong size is a wrong result — the UI shows each team's size
  prominently and flags a team of one.
- **Set assignment:** trigger assignment, see the resulting distribution, and re-derive it from
  `setAssignmentSeed` to demonstrate it was not tampered with. Assignment is audit-logged.
- **Problem authoring:** Markdown editor with live preview; test case editor with bulk paste and
  file upload; reference solution runner that generates expected outputs and **fails loudly if the
  reference solution does not pass its own tests**.
- **Side-activity entry:** per team, a labelled point entry (metal puzzle, train tracks,
  Connections). Admin-only, audit-logged with who entered it and when. This is the one score input
  with no submission behind it, so its audit trail is the only record that exists.
- **Live console:** submissions feed, queue depth, judge health, per-participant and per-team
  drill-down, manual rejudge, manual verdict override (audit-logged, with a required reason),
  and **session revocation** for a named participant.
- **Awards screen:** final team standings, top-3 podium, per-team breakdown, and a one-click export
  to CSV/XLSX so the results still land in a spreadsheet if anyone wants one — but as an *output*,
  never as an input.

### 9.3 Projector view

Full-screen, high-contrast, auto-refreshing **team** leaderboard readable from the back of a
classroom. Shows team rank, team score, rank movement animation, frozen-board indicator, and the
countdown. Per-player breakdown is expandable in the admin and competitor views; the projector
stays at team level, because a room reads ranks and not arithmetic. No login, no chrome, no
scrollbars.

## 10. Technical requirements

| Area | Requirement |
|------|-------------|
| Stack | Next.js (App Router) + TypeScript strict mode; Postgres via Prisma; Redis + BullMQ; Docker Compose for the whole system |
| Editor | Monaco, lazy-loaded |
| Realtime | Server-Sent Events for verdicts and leaderboard; polling fallback |
| Styling | Tailwind + a small component layer; see §11 |
| Testing | Vitest (unit), Playwright (E2E), plus the judge fixture suite in §12 |
| Config | All secrets via env; `.env.example` committed; no secret ever committed |
| Migrations | Prisma migrations checked in; `db:seed` loads `problems_seed.csv` |
| Logs | Structured JSON; judge logs retained per submission for dispute resolution |
| Backups | `pg_dump` cron in compose; documented restore procedure |
| Auth | Three providers — Google OAuth, GitHub OAuth, email/password (scrypt). Sessions are **rows in Postgres**, not JWTs: revocable mid-contest and durable across a restart. Admin-issued join codes remain as an operational fallback. See `docs/AUTH.md` |
| Networking | **Internet is guaranteed at the event.** OAuth round trips and CDN assets are therefore acceptable. This reverses the earlier LAN-first requirement — see the note below |

### 10.1 On dropping the LAN-first requirement

Earlier versions of this document required the platform to run on a LAN with no internet at all: no
CDN-only assets, no runtime third-party calls on any critical path. **The organizer has confirmed
internet is guaranteed at the event, so that requirement is dropped.**

What this unblocks: Google and GitHub OAuth (both need a round trip the room previously could not
make), and CDN-loaded editor assets.

What is still worth keeping, and why it is not merely superstition:

- **The join code path stays.** Not for lack of internet, but because OAuth has failure modes that
  have nothing to do with the venue — an expired client secret, a consent screen, a student without
  a school account. A contest that cannot start because Google is having an afternoon is a contest
  that cannot start.
- **No third-party call on the judging path.** Judging is the one thing that must not depend on
  anything outside the box, and it never did.
- **Vendored editor assets remain preferable.** A CDN is now allowed but is still a runtime
  dependency for the single most important screen. See `docs/TODO.md` T2.

## 11. Design direction

Not a generic dashboard. This is a school event with a decade of history behind it.

- **Audience:** high schoolers, in a room, competing, on a projector.
- **The job of the leaderboard screen:** make rank changes feel like something.
- Use Park Tudor's identity as the palette anchor rather than default Tailwind blue.
- Typography should carry the personality: a characterful display face for standings and
  the countdown, a real monospace (not `font-mono` default) for code and I/O.
- The signature moment is the leaderboard: rank changes should animate meaningfully, and
  the unfreeze at the end should land like a reveal.
- Quality floor, unannounced: responsive to mobile, visible keyboard focus, `prefers-reduced-motion`
  respected, WCAG AA contrast — students will use phones, and the projector is low-contrast.

## 12. Verification gates

These are the acceptance tests. Every gate is a command with a binary pass condition.
**A gate is not passed until its actual output has been shown, not asserted.**

| Gate | Command | Pass condition |
|------|---------|----------------|
| **G0 Build** | `npm run build` | Exit 0, no warnings-as-errors |
| **G1 Types** | `npx tsc --noEmit` | Exit 0, zero errors |
| **G2 Lint** | `npm run lint` | Exit 0, zero errors and zero warnings |
| **G3 Unit** | `npm test -- --run` | 100% pass; ≥90% line coverage on `lib/scoring/**` and `lib/judge/**`; zero `.skip`, `.todo`, or `it.only` |
| **G4 Judge fixtures** | `npm run test:judge` | ≥24 fixture submissions covering AC, WA, TLE, MLE, RE, CE across Python and Java; **24/24 exact verdict match** |
| **G5 Sandbox** | `npm run test:sandbox` | Each hostile fixture (network call, fork bomb, 10 GB alloc, `/etc/passwd` read, host FS write, infinite loop, 1 GB stdout flood) is contained, returns the correct verdict, and the host shows no leaked containers: `docker ps -a` count returns to baseline |
| **G6 Scoring golden** | `npm run test:scoring:golden` | Replays the reconstructed past contest fixture (4 participants × 6 slots × 2 divisions, from `problems_seed.csv`) and matches `fixtures/expected-standings.json` byte-for-byte; replaying twice produces identical output |
| **G7 E2E** | `npx playwright test` | All specs pass headless: join → read problem → run samples → submit → live verdict → leaderboard updates → freeze hides changes → admin unfreezes → admin exports CSV |
| **G8 Load** | `npm run test:load` | 40 concurrent submissions: zero dropped jobs, zero `IE` verdicts, p95 verdict latency < 10s |
| **G9 A11y** | `npm run test:a11y` | axe-core: zero critical or serious violations on competitor, problem, and projector views; keyboard-only submit flow completes |
| **G10 Cold start** | Fresh clone → `docker compose up -d` → `npm run db:seed` → smoke script | Working seeded instance, zero manual steps beyond copying `.env.example`, in under 10 minutes |
| **G11 Security review** | `/security-review` on the full diff | Zero high or critical findings; every finding either fixed or documented in `SECURITY.md` with rationale |
| **G12 Clean tree** | `git status --porcelain` | Empty output; every change committed with a real message |
| **G13 Problem content** | `npm run test:content` | Every problem with authored content has its reference solution score `AC` with full marks **through the real judge**, in real containers, against its own test data; no non-DRAFT problem exists without authored content |

> **Why G13 exists.** Verifying a reference with a local interpreter proves the *algorithm*.
> It does not prove the problem is **judgeable**. The first run of this check failed 9 of 20
> problems that were all algorithmically correct: 8 timed out because the judge's Python
> startup budget was smaller than the measured interpreter startup, and 1 returned `WA`
> because a fixed 1 MiB stdout cap truncated a legitimately 1.29 MB answer and killed the
> container. Neither was visible locally, and neither could be caught by G4, whose fixtures
> all used a problem whose output is one line. Without this gate, eight problems ship
> unsolvable and one punishes every correct submission.
>
> G13 is container-bound and **must not run concurrently with G8** — competing container
> workloads make both sets of timings meaningless, and G8's p95 is the entire point of G8.

## 13. Out of scope (v1)

Team/pair programming with shared editors · plagiarism detection · email notifications ·
mobile native apps · problem difficulty auto-calibration · public internet hosting with
untrusted registration.

**Multi-language is no longer out of scope.** v1 ships ten language choices across five
runtimes — see §7.3. What remains out of scope is any language needing a *new runtime image*
(Rust, Kotlin, C#): adding one is a `RUNTIMES` entry plus a measured startup budget plus a
fixture set, and the measurement is the expensive part, not the registry line.

## 14. Risks

| Risk | Mitigation |
|------|------------|
| Sandbox escape | G5 is a hard gate; judge runs as non-root in a network-less container; deploy the judge on a host with nothing else on it |
| Judge is slow at the end when everyone submits at once | Queue + horizontal worker scaling; G8 proves the target |
| Internet or OAuth fails at the event | Admin-issued join codes are always available as a sign-in path (§10.1); judging never makes a third-party call |
| A team's size is recorded wrong | Team size is the divisor in every team score, so a wrong size is a wrong result. The admin UI shows sizes prominently and flags a team of one; §12 G6 replays a golden fixture with uneven teams |
| A player disputes their assigned problem set | Assignment is seeded from `Contest.setAssignmentSeed` and audit-logged, so it can be re-derived and shown rather than argued about (§6.2) |
| Nobody maintains it after the authors graduate | README, seeded demo contest, and an admin UI that requires no SQL |
| Copyright on imported problems | §8 — titles only, statements written fresh, `DRAFT` gate enforced in the API |
| An overnight autonomous build produces something that compiles but does not work | Gates G4–G8 are behavior tests, not build tests; the goal condition names them explicitly |

## 15. Appendix A — Past contest structure (from `Problems_List.xlsx`)

Two divisions, three difficulty slots each, four participants per slot in the reconstructed
contest. Use this as the shape of the golden scoring fixture (G6).

| Slot | Player A | Player B | Player C | Player D |
|------|----------|----------|----------|----------|
| Intermediate (E) | Jumping on the Cloud | Mini-Max Sum | Simple Array Sum | Circular Array Rotation |
| Intermediate (M) | Bill Division | Ice Cream Parlor | sWAP cASE | Designer PDF Viewer |
| Intermediate (H) | Gaming Array | Morgan and a String | Counting Valleys | Day of the Programmer |
| Advanced (E) | Bill Division | Ice Cream Parlor | Java Primality test | Climbing the Leaderboard |
| Advanced (M) | Gaming Array | Morgan and a String | Encryption | Drawing Book Problem |
| Advanced (H) | Gena Playing Hanoi | Larry's Array | Magic Square | Bigger is Greater |

**Group round:** three hard problems (Insertion Sort Advanced Analysis, Fraudulent Activity
Notifications, Cards Permutation) each gated behind three hints, with hints purchased at a
rate of two CodingBat warmups per hint. The warmup pool is 60 problems, 30 Python and 30
Java, and is imported in `problems_seed.csv` with `type=codingbat`.

> Corrected from "five" — `problems_seed.csv` carries 5 `group` rows but only these 3
> distinct titles, two of them exact duplicate rows. See §16.1 and `docs/DECISIONS.md` D3.
> The hint economy is unaffected: 60 warmups fund far more than the 9 hints (3 problems ×
> 3 hints) the round can absorb.

## 16. Appendix B — Seed data

`problems_seed.csv` — 136 rows extracted from `Problems_List.xlsx`, which seed
**125 distinct `Problem` records**. Rows are not problems: a row is one *appearance* of a
problem in contest history, so the same problem recurs across divisions and statuses.

| type | rows | distinct titles | meaning |
|------|------|-----------------|---------|
| `algorithm` | 71 | 63 | Contest problems from past nights |
| `codingbat` | 60 | 60 | Warmup problems used as hint currency (30 Python, 30 Java) |
| `group` | 5 | 3 | Hint-gated group-round problems |
| **total** | **136** | **125 problems** | |

> The distinct column counts titles *within each type* and sums to 126, one more than the
> 125 problems actually seeded. The difference is `Fraudulent Activity Notifications`, which
> appears under both `algorithm` and `group`. It seeds as **one** problem carrying
> `type=ALGORITHM` (its first appearance) and `isGroupProblem=true`. `isGroupProblem` — not
> `type` — is what drives hint pricing in §6.1, so nothing is lost.

| `past_status` | rows | distinct | meaning |
|---------------|------|----------|---------|
| `hint-currency` | 60 | 60 | CodingBat warmups |
| `used-in-contest` | 24 | 20 | Assigned to a specific division/difficulty slot |
| `solved-in-past` | 20 | 20 | Someone has solved it — safe difficulty |
| `candidate-unused` | 15 | 15 | Never used; carries HackerRank acceptance rate as a difficulty hint |
| `used-but-zero-points` | 9 | 9 | Used and **nobody scored** — flag loudly in the picker |
| `group-problem` | 5 | 3 | Group round |
| `partially-solved-in-past` | 3 | 3 | Partial credit was earned |

### 16.1 Dedup key — get this right or the seeder drops real problems

**The dedup key is `(title, language)` for `codingbat` rows and `title` alone for every
other type.** Title alone is wrong: `sum67` is a real CodingBat exercise offered in *both*
Python and Java, so keying on title collapses two genuine warmups into one and quietly
shrinks the hint economy. All 60 warmups are distinct.

Ten titles legitimately recur and must collapse to a single `Problem`, with the
division/difficulty/slot carried on `ContestProblem` where PRD §5 already puts it:

- **Used in both divisions at different difficulties** — `Bill Division` (Int/M, Adv/E),
  `Gaming Array` (Int/H, Adv/M), `Ice Cream Parlor` (Int/M, Adv/E), `Morgan and a String`
  (Int/H, Adv/M).
- **Both `solved-in-past` and `used-in-contest`** — `Circular Array Rotation`,
  `Day of the Programmer`, `Designer PDF Viewer`, `Encryption`.
- **Exact duplicate rows** (spreadsheet export artifact, no distinguishing field) —
  `Insertion Sort Advanced Analysis` ×2.
- **Spans two types** — `Fraudulent Activity Notifications` appears 3× : once as
  `algorithm`/`used-but-zero-points` and twice as `group`/`group-problem`. It is one
  problem that is *both* a group-round problem *and* one nobody has ever scored on. Both
  facts must survive the merge, because §8 wants that warning surfaced loudly — and this is
  the problem it matters most on.

`db:seed` must be idempotent: running it twice produces the same 125 problems, not 250.
G10's cold start depends on it.
