# KICKOFF — Park Tudor Coding Night

You are building the Park Tudor Coding Night contest platform. The full spec is in
`docs/PRD.md` and the project rules are in `CLAUDE.md` — read both completely before
writing any code. `data/problems_seed.csv` holds 136 rows of real problem history from
past contests.

This is an autonomous overnight build. The human will not be available to answer questions.
When you hit an ambiguous decision, pick the option that best serves `docs/PRD.md` §3
success criteria, write the decision and your reasoning to `docs/DECISIONS.md`, and keep
moving. Never stop and wait. Never leave the repo in a non-building state at the end of a
turn.

Work in this order. Do not skip ahead — later phases depend on earlier gates passing.

---

## Phase 0 — Ground yourself (one turn)

- Read `docs/PRD.md` end to end. Read `CLAUDE.md`. Read `data/problems_seed.csv`.
- Run `/init` to reconcile `CLAUDE.md` with the repo as it actually is. Do not delete the
  "Rules that are easy to get wrong here" section — extend it as you learn things.
- Write `docs/PLAN.md`: the phase breakdown, which subagent owns which directory, the merge
  order, and the file-ownership partition. No two agents may own the same directory.
- Create the subagents described at the bottom of this file as files in `.claude/agents/`.
- Stop and report. The human will review `docs/PLAN.md` and then set the goal.

## Phase 1 — Skeleton and contracts (sequential, no parallelism yet)

Parallel agents that share undefined interfaces produce garbage. Build the contracts first:

- Next.js + TypeScript strict, Tailwind, Prisma, Postgres, Redis, BullMQ, docker-compose.
- The complete Prisma schema from PRD §5, with migrations.
- Every shared TypeScript type and Zod schema, in `lib/types/` and `lib/schemas/`.
- The judge job contract: what a job carries in, what a verdict carries out.
- Stub npm scripts for every gate G0–G9. They may fail; they must exist and be wired.
- **Gate:** G0 build, G1 typecheck, G2 lint all pass. Show the output. Commit.

## Phase 2 — The judge (highest risk, build before anything pretty)

Read PRD §7. Build the worker and the per-submission container isolation exactly as
specified: `--network=none`, read-only rootfs, tmpfs `/tmp` with a size cap, non-root user,
`--cap-drop=ALL`, `--security-opt=no-new-privileges`, `--pids-limit`, `--memory`, `--cpus`,
and a wall-clock kill at 3× the problem time limit. Python 3.12 and Java 21.

Build the fixture suites **before** declaring it done:

- `fixtures/judge/` — at least 24 submissions across Python and Java producing known AC,
  WA, TLE, MLE, RE, and CE verdicts.
- `fixtures/sandbox/` — hostile submissions: outbound network call, fork bomb, 10 GB
  allocation, read `/etc/passwd`, write outside `/tmp`, infinite loop, 1 GB stdout flood.
- **Gate:** G4 must be 24/24 exact verdict matches. G5 must contain every hostile fixture
  **and** leave `docker ps -a` at its baseline count. Show both outputs. Commit.

If G5 does not pass, stop all other work and fix it. A leaky sandbox invalidates the
entire project.

## Phase 3 — Scoring engine (the thing that replaces the spreadsheet)

Read PRD §6. `lib/scoring/` contains pure functions only: no I/O, no `Date.now()`, no
randomness, all time passed in as arguments. Implement both presets.

Build the golden fixture from PRD Appendix A: reconstruct the past contest — 2 divisions,
3 difficulty slots each, 4 participants (Player A through Player D) — hand-compute the
expected standings, and save them to `fixtures/expected-standings.json`.

- **Gate:** G6 must match byte-for-byte, and replaying the same log twice must produce
  identical output. Show the output. Commit.

## Phase 4 — Parallel build-out (now you may fan out)

The contracts are frozen and the two risky engines are proven. Split the remaining work
across subagents in isolated worktrees, respecting the file-ownership partition in
`docs/PLAN.md`. Run at most 4 implementation agents at once. Each agent owns a
non-overlapping directory set, has a stated done condition and a test command, commits to
its own worktree branch, and reports changed files plus test results.

Suggested split:

```
backend-api       → app/api/**, lib/contest/**
frontend-contest  → app/(competitor)/**, components/contest/**
frontend-admin    → app/(admin)/**, components/admin/**
projector         → app/projector/**, components/leaderboard/**
```

Nobody but the orchestrator edits `prisma/schema.prisma`, `lib/types/**`, lockfiles, or
root config.

Use a dynamic workflow (say "use a workflow") for these three tasks specifically, because
they benefit from many agents cross-checking each other:

1. Audit every API route handler for missing authorization checks and for any path where
   hidden test data could reach a non-admin client. Adversarially verify each finding
   before reporting it.
2. Generate original problem statements and test data for the 20 problems marked
   `solved-in-past` in `data/problems_seed.csv` — one agent per problem, each writing an
   original statement, a reference solution, a random input generator, and 10+ test cases,
   then verifying the reference solution passes its own tests.
3. Keep running `npx tsc --noEmit` and fixing reported errors until the typecheck passes or
   two rounds in a row make no progress.

Merge in the order `docs/PLAN.md` specifies. After each merge, re-run G0–G3 and show output.

## Phase 5 — Design pass

Read PRD §11. Use the `frontend-design` skill. Do not ship a generic dashboard. Before
writing CSS, write `docs/DESIGN.md` with the token system: 4–6 named hex values; a display
face, a body face, and a monospace face with a stated type scale; a layout concept; and the
one signature element the projector leaderboard will be remembered by. Review that plan
against the brief and revise anything that reads like a default rather than a choice. Then
build to the plan exactly.

## Phase 6 — Verification and hardening

- Write `scripts/verify.sh` so `npm run verify` runs G0 through G9 in order and prints a
  PASS/FAIL table with the actual command output for each gate.
- Run `/security-review` on the full diff. Fix every high and critical finding. Document any
  accepted finding in `SECURITY.md` with the rationale.
- Run `/code-review high --fix` on the diff and apply what's correct.
- Write `README.md`: what it is, how to run it, how to run a contest night, how to add a
  problem, how to restore from backup. Assume the reader is a student who has never seen
  the repo.
- **Gate:** every gate G0–G12 in PRD §12 passes. Show every output. Commit.

---

## Verification protocol — read this twice

The `/goal` evaluator that decides whether you keep working is a separate model that reads
this conversation. It cannot run commands and it cannot read files. It only knows what you
have shown it. Therefore:

1. **Never claim a gate passes.** Run the command and paste the actual output.
2. After every gate run, print a status block in exactly this format:

```
=== GATE STATUS ===
G0  build            PASS
G1  typecheck        PASS
G2  lint             PASS
G3  unit             FAIL  3/214 failing: scoring/penalty.test.ts
G4  judge fixtures   PASS  24/24
G5  sandbox          PASS  7/7 contained, docker ps -a at baseline
G6  scoring golden   PASS  byte-identical, replay stable
G7  e2e              NOT RUN
G8  load             NOT RUN
G9  a11y             NOT RUN
G10 cold start       NOT RUN
G11 security         NOT RUN
G12 clean tree       PASS
=== END GATE STATUS ===
```

3. A gate is PASS only on real, shown output. "Should pass" is FAIL. "Passed earlier" is
   NOT RUN — rerun it.
4. Never mark a test `.skip`, `.todo`, or `it.only` to turn a gate green. Never delete or
   weaken a test to make it pass. Never lower a coverage threshold. If a test is wrong, fix
   the test and say in your turn output that you changed it and why.
5. Never stub a function to satisfy a type and move on. If something is genuinely
   incomplete, it goes in `docs/TODO.md` and the relevant gate stays FAIL.
6. If you get stuck on the same failure three turns in a row, stop attacking it directly:
   write what you tried to `docs/DECISIONS.md`, run `/deep-research` on the specific
   technical question, and come back with what you learned.

Every turn ends with: what you did, what gate state that leaves you in, and what you are
doing next. Keep turns tight — do not let the conversation fill with file dumps. Delegate
searching and log-reading to subagents so their output stays out of the main context.

---

## Subagents to create in `.claude/agents/`

One file each. Put worktree isolation on the implementation agents so parallel edits never
collide.

| Agent | Owns | Notes |
|-------|------|-------|
| `judge-sandbox` | `worker/**`, `lib/judge/**` | Container isolation, resource limits, verdict determination. Read the Docker docs rather than guessing at flags. Never relaxes an isolation flag to make a test pass. |
| `scoring-engine` | `lib/scoring/**`, `fixtures/scoring/**` | Pure functions only. Rejects any request to add I/O to this directory. |
| `backend-api` | `app/api/**`, `lib/contest/**` | Zod at every boundary. Never returns hidden test data to a non-admin caller. |
| `frontend-ui` | `app/(competitor)/**`, `app/(admin)/**`, `app/projector/**`, `components/**` | Follows `docs/DESIGN.md` exactly. Uses the `frontend-design` skill. |
| `problem-content` | `content/problems/**`, `data/**` | Writes **original** problem statements — never copies HackerRank text. Generates test data from a reference solution plus a random generator and verifies the reference passes its own tests. |
| `test-infra` | `tests/**`, `fixtures/**`, `playwright.config.ts`, `scripts/verify.sh` | Reads and writes tests only — never edits application source to make a test pass. |
| `security-auditor` | read-only: no Write, no Edit | Audits sandbox escape surface, authz on every route, secret handling, and hidden-test-data leakage. Reports findings; does not fix them itself. |

---

**Start with Phase 0 now.**
