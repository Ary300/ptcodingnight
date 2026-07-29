# CLAUDE.md — Park Tudor Coding Night

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

Contest platform for Park Tudor's Coding Night. Replaces HackerRank + manual spreadsheet
scoring. Read `docs/PRD.md` before any substantial change; it is the spec of record.
`docs/KICKOFF.md` is the build order and the gate-reporting protocol.

## Current state (read this first)

**The repo contains no application code yet.** Tracked files are `CLAUDE.md`, `docs/PRD.md`,
`docs/KICKOFF.md`, `data/problems_seed.csv`, and `.gitignore`. There is no `package.json`,
no `app/`, no `lib/`, no `prisma/`, no `worker/`, no `fixtures/`.

Everything in **Commands** and **Architecture** below is therefore a *target contract*, not
a description of what runs today. Phase 1 of `docs/KICKOFF.md` creates the skeleton that
makes those commands real. Update this section when that lands — do not let this file
describe a codebase that does not exist.

Toolchain verified present on this machine: Node v22.20.0, npm 10.9.3, Docker 29.1.2,
Docker Compose v2.40.3. **The Docker daemon is not currently running**, which blocks gates
G4, G5, G8, and G10 (see `docs/DECISIONS.md`).

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
```

Single test: `npm test -- --run path/to/file.test.ts`, or `-t "name"` to filter by name.

## Architecture

- `app/` — Next.js App Router. Route handlers are thin: validate, delegate, respond.
- `lib/scoring/` — **pure functions only.** `computeStandings(config, submissions, hints)`.
  No I/O, no Date.now(), no randomness. All time comes in as arguments.
- `lib/judge/` — job definition, verdict aggregation, output comparators.
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
- **Hidden test data never reaches the client.** Sample tests may show a full diff. Hidden
  tests return pass/fail and timing only, plus at most a 200-character truncated diff.
  Students will diff their way to the test data if you let them.
- **Never copy HackerRank problem statements, editorials, or test data.** The seed file
  imports titles and history only. Problems stay in `DRAFT` until an original statement and
  own-generated test data exist, and the API — not just the UI — rejects `DRAFT` problems in
  live contests.
- **Verdict `IE` is never shown to a student as a failure.** Requeue once, then alert admin.
- **The night has no internet.** No CDN-only assets, no runtime third-party API calls on
  any critical path.
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
