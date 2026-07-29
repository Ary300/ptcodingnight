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
- Divisions (Intermediate / Advanced), per-player problem slots, partial credit, group
  rounds, and the CodingBat-for-hints mechanic are all reconciled by hand.
- The winner is computed manually, after everyone has gone home, which kills the moment.
- Past problem history lives in one fragile spreadsheet (`Problems_List.xlsx`), so
  organizers re-pick problems that were already used or that nobody could solve.

**The organizers spend the event doing data entry instead of running the event.**

## 2. What we are building

A self-hosted Park Tudor Coding Night web platform that:

1. Hosts contests with problems, sample cases, and hidden test cases.
2. Judges Python and Java submissions automatically in a sandbox, with real verdicts
   (Accepted / Wrong Answer / Time Limit Exceeded / Memory Limit Exceeded / Runtime Error /
   Compile Error) and per-test detail.
3. Scores every submission the instant it lands, using the Coding Night rules — divisions,
   difficulty weights, partial credit, penalties, hint costs, group rounds.
4. Shows a live leaderboard on the projector and declares a winner the second the clock
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

Auth: Google sign-in restricted to the school domain is preferred; a fallback of
admin-issued join codes + display names must exist so the platform works even if Google
Workspace access is not available on the night.

## 5. Core domain model

```
User            id, email, displayName, role, gradYear
Contest         id, name, startsAt, endsAt, freezeAt, state, scoringPresetId, joinCode
Division        id, contestId, name ("Intermediate" | "Advanced"), sortOrder
Problem         id, slug, title, statementMd, inputSpec, outputSpec, constraints,
                difficulty (E|M|H), timeLimitMs, memoryLimitMb, allowedLanguages[],
                referenceSolution, originAttribution, isGroupProblem, tags[]
TestCase        id, problemId, ordinal, input, expectedOutput, isSample, points, group
ContestProblem  contestId, problemId, divisionId, slotLabel, basePoints, unlockAt
Participant     id, contestId, userId|displayName, divisionId, teamId?
Submission      id, participantId, contestProblemId, language, sourceCode, submittedAt,
                verdict, score, runtimeMs, memoryKb, judgedAt, judgeLogRef
TestResult      submissionId, testCaseId, verdict, runtimeMs, memoryKb, diffSnippet
HintGrant       id, participantId, contestProblemId, hintIndex, grantedAt, costPaidRef
Standing        (materialized) participantId, divisionId, score, penalty, lastAcceptedAt, rank
AuditLog        actor, action, entity, before, after, at
```

Problem statements are stored as Markdown with KaTeX math support. Test data is stored as
files on disk (referenced by the DB), not as giant DB blobs, so large cases stay cheap.

## 6. Scoring engine (this is the part that replaces the spreadsheet)

Scoring must be a **pure, deterministic, unit-tested function**:

```
score(contestConfig, submissions[], hintGrants[]) -> Standing[]
```

No scoring logic anywhere else in the codebase. The API and UI read its output only.

### 6.1 Default preset — "Coding Night Classic"

- Each contest problem has `basePoints` derived from difficulty: **E = 100, M = 200, H = 300**
  (organizer-editable per problem).
- **Partial credit:** test cases carry points. A submission's score for a problem is the
  best score any of that participant's submissions achieved. This preserves the
  spreadsheet's existing "partially solved" concept.
- **Penalty:** 5 minutes per rejected submission on a problem that is *eventually* scored
  above zero. Rejected submissions on never-scored problems cost nothing.
- **Hints:** each hint taken on a group problem deducts 15% of that problem's base points.
  Hints are earned by solving CodingBat-style warmups — **2 warmups = 1 hint** — and the
  ledger is tracked by the platform, not by an organizer with a clipboard.
- **Ranking:** score DESC → total penalty ASC → time of last score-increasing submission ASC.
  Any remaining tie is displayed as a genuine tie, never broken arbitrarily.
- Divisions rank independently. There is an Intermediate winner and an Advanced winner.

### 6.2 Alternate preset — "ICPC"

Binary AC/no-AC, 20-minute penalty per wrong submission on solved problems, rank by
solve count then penalty. Selectable per contest.

### 6.3 Hard requirements

- Recomputing standings from the raw submission log must produce byte-identical output
  every time (idempotent replay).
- Freeze: after `freezeAt`, the public leaderboard stops updating but judging continues.
  Admin view still shows live truth. Unfreeze reveals the final board dramatically.
- Every score change is written to `AuditLog` so a disputed result can be explained.

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

Language runtimes ship as pinned images: `python:3.12-slim`, `eclipse-temurin:21-jdk`.
Java compiles once per submission, then runs each test against the compiled class.

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

### 7.3 Non-negotiables

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

- **Join:** enter code or sign in → pick display name → land in contest lobby.
- **Contest view:** problem list with slot label, difficulty, points, own status
  (unsolved / partial n pts / solved), and a countdown clock.
- **Problem view:** statement, constraints, sample I/O with a copy button, language picker,
  Monaco editor with syntax highlighting and Tab-to-indent, "Run samples" (free, no penalty)
  and "Submit" (judged, counts).
- **Verdict panel:** streams live. Per-test rows: sample tests show the diff, hidden tests
  show pass/fail and timing only.
- **Hints:** shows hint balance, warmups solved, and what the next hint costs before the
  student commits to taking it.
- **My submissions:** full history with code, verdict, and score.

### 9.2 Organizer experience

- **Contest builder:** name, window, divisions, scoring preset, join code, freeze time.
- **Problem authoring:** Markdown editor with live preview; test case editor with bulk
  paste and file upload; reference solution runner that generates expected outputs and
  **fails loudly if the reference solution does not pass its own tests**.
- **Live console:** submissions feed, queue depth, judge health, per-participant drill-down,
  manual rejudge, manual verdict override (audit-logged, with a required reason).
- **Awards screen:** final standings per division, top-3 podium, and a one-click export to
  CSV/XLSX so the results still land in a spreadsheet if anyone wants one — but as an
  *output*, never as an input.

### 9.3 Projector view

Full-screen, high-contrast, auto-refreshing leaderboard readable from the back of a
classroom. Shows division tabs, rank movement animation, frozen-board indicator, and the
countdown. No login, no chrome, no scrollbars.

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
| Offline | The platform must work on a LAN with no internet, because school Wi-Fi will fail on the one night it matters. No CDN-only assets, no runtime calls to third-party APIs on the critical path |

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

## 13. Out of scope (v1)

Team/pair programming with shared editors · plagiarism detection · email notifications ·
mobile native apps · problem difficulty auto-calibration · public internet hosting with
untrusted registration · languages beyond Python and Java (C++ is a v2 candidate).

## 14. Risks

| Risk | Mitigation |
|------|------------|
| Sandbox escape | G5 is a hard gate; judge runs as non-root in a network-less container; deploy the judge on a host with nothing else on it |
| Judge is slow at the end when everyone submits at once | Queue + horizontal worker scaling; G8 proves the target |
| School Wi-Fi dies | LAN-first deployment, no CDN-only assets |
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

**Group round:** five hard problems (Insertion Sort Advanced Analysis, Fraudulent Activity
Notifications, Cards Permutation) each gated behind three hints, with hints purchased at a
rate of two CodingBat warmups per hint. The warmup pool is 60 problems, 30 Python and 30
Java, and is imported in `problems_seed.csv` with `type=codingbat`.

## 16. Appendix B — Seed data

`problems_seed.csv` — 136 rows extracted from `Problems_List.xlsx`:

| type | count | meaning |
|------|-------|---------|
| `algorithm` | 71 | Contest problems from past nights |
| `codingbat` | 60 | Warmup problems used as hint currency (30 Python, 30 Java) |
| `group` | 5 | Hint-gated group-round problems |

| `past_status` | count | meaning |
|---------------|-------|---------|
| `hint-currency` | 60 | CodingBat warmups |
| `used-in-contest` | 24 | Assigned to a specific division/difficulty slot |
| `solved-in-past` | 20 | Someone has solved it — safe difficulty |
| `candidate-unused` | 15 | Never used; carries HackerRank acceptance rate as a difficulty hint |
| `used-but-zero-points` | 9 | Used and **nobody scored** — flag loudly in the picker |
| `group-problem` | 5 | Group round |
| `partially-solved-in-past` | 3 | Partial credit was earned |
