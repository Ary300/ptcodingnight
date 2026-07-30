# CLAUDE.md — Park Tudor Coding Night

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

Contest platform for Park Tudor's Coding Night. Replaces HackerRank + manual spreadsheet
scoring. Read `docs/PRD.md` before any substantial change; it is the spec of record.
`docs/KICKOFF.md` is the build order and the gate-reporting protocol.

## Current state (read this first)

The application exists. `app/`, `lib/`, `worker/`, `prisma/`, `fixtures/`, `components/` and
`scripts/` are all real, and the commands below run.

**Gate status as last measured on this machine** (macOS, Docker Desktop):

| Gate | State | Note |
|---|---|---|
| G1 typecheck, G2 lint, G3 unit | PASS | 292 unit tests |
| G4 judge fixtures | PASS | 57/57 across all five runtimes |
| G5 sandbox | PASS | 17/17, 13 hostile fixtures across four runtimes |
| G6 golden scoring | PASS | includes the team formula |
| G7 E2E, G9 a11y | **stale** | written against individual scoring; need rewriting for teams |
| G8 load | **FAIL, and it is a hardware answer** | p95 110,767 ms against a 10,000 ms target — 11×. See `docs/HOSTING.md`; the threshold was never lowered |
| G13 problem content | needs a re-run | after the registry rewrite |

**Docker is running and all five runtime images are built**, including `ptcn-go:1.23`, which is
built locally rather than pulled. Run `scripts/build-judge-images.sh --verify` on any new host.

**The team-scoring rewrite is partly landed.** Schema, migration, scoring engine, set assignment
and the auth layer are done and tested; the routes, UI and G7 specs are not. `docs/TODO.md` is the
honest list — read it before assuming a feature is reachable over HTTP.

## Commands

```bash
npm run dev              # Next.js dev server
npm run build            # production build                (G0)
npx tsc --noEmit         # typecheck (must be clean)       (G1)
npm run lint             # eslint (must be zero warnings)  (G2)
npm test -- --run        # vitest unit suite               (G3)
npm run test:judge       # judge verdict fixtures          (G4)
npm run test:sandbox     # hostile-submission fixtures     (G5)
npm run test:scoring:golden  # replay golden contest       (G6)
npx playwright test      # E2E                             (G7)
npm run test:load        # 40-submission burst             (G8)
npm run test:a11y        # axe-core                        (G9)
npm run test:content     # references through the judge    (G13)
npm run verify           # runs the gates in order, prints a PASS/FAIL table
docker compose up -d     # full stack: web, worker, postgres, redis
npm run db:seed          # loads data/problems_seed.csv

scripts/build-judge-images.sh --verify   # pull + build every runtime image. REQUIRED before
                                         # the night and before G4/G5/G13 on a new host.
```

Single test: `npm test -- --run path/to/file.test.ts`, or `-t "name"` to filter by name.

## Architecture

- `app/` — Next.js App Router. Route handlers are thin: validate, delegate, respond.
- `lib/scoring/` — **pure functions only.** `computeTeamStandings(...)` is the Coding Night entry
  point; `computeStandings(...)` scores individual players and feeds it.
  No I/O, no Date.now(), no randomness. All time comes in as arguments.
- `lib/judge/` — job definition, verdict aggregation, output comparators. `runtimes.ts` is the
  language registry: five runtimes (image + measured budget + compile limits), ten variants
  (compile flags on top of a runtime).
- `worker/` — the judge worker process. Spawns one ephemeral Docker container per
  submission and reaps it.
- `prisma/` — schema and migrations.
- `fixtures/` — judge fixtures, hostile submissions, golden standings.

The one-way dependency that matters: `app/` and `worker/` may import `lib/`; `lib/scoring/`
imports nothing from either. If scoring needs a fact, it arrives as an argument.

## Rules that are easy to get wrong here

- **Untrusted code never runs in the web process or the worker process itself.** Always a
  fresh container: `--network=none`, read-only rootfs, tmpfs `/tmp` with a size cap,
  non-root user, `--cap-drop=ALL`, `--security-opt=no-new-privileges`, `--pids-limit`,
  `--memory`, `--cpus`, and a wall-clock kill at 3× the problem's time limit.
- **Scoring lives in exactly one place.** If you find yourself computing points in a route
  handler, a React component, or a SQL query, stop and put it in `lib/scoring/`.
- **Standings must be replayable.** Recomputing from the raw submission log twice must
  produce identical output. Never store a running total that cannot be re-derived.
- **Replayable means byte-identical, not "the numbers came out right".** Anything the engine
  emits as an array must be sorted by a stable key, because Postgres returns rows in whatever
  order it likes. Team standings shipped a bug here: ranks and scores were correct, but the
  per-player breakdown followed input order, so the same contest replayed to different bytes.
- **Team scores are integer hundredths of a point, never floats.** The team score is a mean, so
  `543.75` is a normal result. `3 * 0.15 * 250` already evaluated to `112.49999999999999` in
  this codebase once and cost a student a point. There is exactly one rounding site — the mean,
  half away from zero. See `docs/SCORING.md` §3.
- **Team size is the divisor, so a wrong roster is a wrong result.** Not a cosmetic error. Team
  size is always derived from the roster and never stored as a count, because a stored count is a
  second source of truth that drifts from the thing it describes.
- **The spreadsheet's historical answer for the worked example is WRONG and is pinned as such.**
  `fixtures/expected-team-standings.json` records 512.5 as a named wrong result with a test
  asserting no config reproduces it. It dropped the group points. Do not "fix" a test to agree
  with it — a regression that dropped group points again would look like agreement with history,
  which is the most convincing possible disguise for a scoring bug.
- **Hidden test data never reaches the client.** Sample tests may show a full diff. Hidden
  tests return pass/fail and timing only, plus at most a 200-character truncated diff.
  Students will diff their way to the test data if you let them.
- **Never copy HackerRank problem statements, editorials, or test data.** The seed file
  imports titles and history only. Problems stay in `DRAFT` until an original statement and
  own-generated test data exist, and the API — not just the UI — rejects `DRAFT` problems in
  live contests.
- **Verdict `IE` is never shown to a student as a failure.** Requeue once, then alert admin.
- **Internet at the event is guaranteed, so OAuth and CDNs are allowed** (PRD §10.1). This
  REVERSES the old LAN-first rule. Two things survive it, for reasons unrelated to the venue: the
  judging path still makes no third-party call, and the join-code sign-in stays, because OAuth
  fails for its own reasons — expired client secret, consent screen, a student with no school
  account. If you find a comment justifying something by "the room has no internet", it predates
  this and the justification is stale even where the conclusion holds.
- **The seed CSV has 136 rows but only 125 distinct titles — do not key `Problem` on title
  alone without a dedup policy.** Nine of the eleven repeats are legitimate: the same
  problem was used in both divisions at different difficulties (`Bill Division` is
  Intermediate/M *and* Advanced/E), or is both `solved-in-past` and `used-in-contest`. Model
  it as one `Problem` per normalized title, with `ContestProblem` carrying division,
  difficulty, and slot. See `docs/DECISIONS.md` for the two rows that are genuine data
  errors.
- **Never time a submission by timing `docker run`.** Container creation on this host costs
  2.4–15.6 s and varies run to run. Charging that to the student fails every correct
  solution. The wall-clock kill runs as coreutils `timeout` *inside* the container, and the
  execution time comes from the daemon's `State.StartedAt`/`FinishedAt`.
- **Java needs a startup budget, not a bigger multiplier.** A JVM that does nothing but add
  two integers takes 1.0–5.3 s inside the isolation flags. The limit is
  `problemLimit × multiplier + startupBudget` (`worker/runner.ts`); a pure multiplier makes
  short problems unjudgeable and produces *intermittent* TLEs on correct code.
- **`timeout` does not always exit 124.** It returns 124 only when it had to kill the
  process. The JVM handles SIGTERM and exits 143; a process that ignores it takes SIGKILL
  and exits 137. Treat all three as TLE or Java infinite loops report as `RE`.
- **Containers are created without `--rm` on purpose.** `docker inspect` is the only way to
  read `OOMKilled` — the sole reliable way to tell MLE from TLE, since both exit 137.
  Removal is explicit, with a prefix sweep as the backstop.
- **Adding a language is a line in `lib/judge/runtimes.ts`, never a change to
  `worker/runner.ts`.** The runner does not switch on language anywhere and must not start. A
  new *variant* (C++20) is a `VARIANTS` entry; a new *runtime* (Rust) is also a measured startup
  budget, compile limits, and a fixture set — the measurement is the expensive part.
- **Go does not use the stock `golang` image, and this one bites hard.** Since Go 1.20 the
  standard library is not shipped pre-compiled, so a fresh container rebuilds it every
  submission: 65.8 s in-container against 2.5–11.8 s warm. It does not fail loudly — it blows
  `compileTimeoutMs` and reports **CE on correct code**. `docker/go/Dockerfile` bakes a
  world-readable cache at `/opt/gocache` on the read-only rootfs (Go reads a cache it cannot
  write to; the one new entry goes to `GOTMPDIR` in tmpfs). Build flags are part of Go's cache
  key, so **any flag in the registry's `compileCommand` that the Dockerfile did not also use
  silently misses the entire cache.** `scripts/build-judge-images.sh --verify` is what catches
  that, and it must run on the judge host before the night.
- **Compile limits are separate from run limits on all five axes** — timeout, memory, pids,
  tmpfs, cpus. A cgroup has one cap each. Size them for the compiler and an 800 MB program is
  never OOM-killed, so MLE detection silently stops working; size them for the problem and
  `javac` or `go build` fails and the student sees CE on code that compiles fine. Each of those
  five axes is a bug this project actually shipped.
- **A slug must never carry a runtime version.** `Problem.slug` is a URL and a database key.
  Deriving it from the registry's `LanguageId` gives `sum67-python-312`, and bumping to Python
  3.13 then renames every warmup, orphaning its rows and every bookmarked link. See
  `SLUG_LANGUAGE_TOKEN` in `lib/schemas/seed.ts`.
- **`fixtures/` is excluded from eslint on purpose.** The CE fixtures do not parse and the TLE
  fixtures are infinite loops. Every lint finding in there is a fixture working correctly, and
  "fixing" them destroys the suite. The judge validates them, not the linter.
- **Judge scratch goes in `.judge-tmp/`, never `os.tmpdir()`.** macOS temp lives under
  `/var/folders`, which Docker Desktop does not share; bind-mounting it yields a silently
  empty directory inside the container.
- **A reference solution that passes locally is not a judgeable problem.** Local `python3`
  proves the algorithm; only G13 (`npm run test:content`) proves the problem survives the
  real judge. That distinction hid 8 unsolvable problems and 1 that failed every correct
  submission — none visible from local runs, none catchable by G4.
- **Never cap judge output at a fixed size.** A correct answer can legitimately be
  megabytes; truncating it kills the container and reports `WA`, which the student cannot
  distinguish from their own bug. The cap is derived per test from the expected output
  (`outputCapFor`).
- **G8 and G13 must never run concurrently.** Both spawn containers, and interleaving them
  corrupts G8's p95 latency measurement, which is the only thing G8 measures.
- **A verdict is not a gate.** `npm run verify` output goes in the transcript verbatim. See
  **Definition of done**.

## Conventions

- TypeScript strict. No `any`; use `unknown` and narrow.
- Zod at every trust boundary (route input, env, seed file parsing).
- Errors: throw typed domain errors, map to HTTP at the route edge. No swallowed catches.
- Tests colocate as `*.test.ts`; fixtures live in `fixtures/`, never inline in tests.
- Commit messages describe the behavior change, not the file list.

## Definition of done

A change is not done until `npm run verify` prints an all-PASS table **and that output
appears in the transcript.** Do not report a gate as passing from memory or inference —
run it and show it. Never mark a test `.skip`, `.todo`, or `it.only` to get a gate green;
that is a failure, not a pass. Genuine gaps go in `docs/TODO.md` with the gate left FAIL.
