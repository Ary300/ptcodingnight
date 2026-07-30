# Park Tudor Coding Night

A contest platform for Park Tudor's Coding Night. It replaces HackerRank plus a manually
maintained scoring spreadsheet with something that judges submissions in a sandbox, scores teams
by a formula anyone can check, and puts a live board on the projector.

Live at **<https://ptcodingnight.com>**.

---

## What it does

- **Students** join with a code off the board, read a problem, run the samples for free, and
  submit. A verdict comes back on a live stream. Their own submission history is theirs to read.
- **Organizers** run the contest: start, freeze, unfreeze, override a verdict with a recorded
  reason, enter side-activity points, and export the results as CSV.
- **The room** watches a projector board that ranks teams and says, in words, whether it is live
  or frozen.

Every submission runs in its own throwaway Docker container with no network, a read-only root
filesystem, a non-root user, no capabilities, and caps on memory, processes, CPU, file size and
disk. Five language runtimes: Python, Java, C++, JavaScript and Go.

---

## Scoring, in one paragraph

A team's score is **every member's points, group problems included, divided by the number of
people on the team, plus flat side-activity points.** The divisor is the roster, derived rather
than stored, because a stored count drifts from the thing it describes — and **a wrong roster is
a wrong result rather than a cosmetic error.**

Team scores are integer hundredths of a point and never floats. `3 * 0.15 * 250` evaluated to
`112.49999999999999` in this codebase once and cost a student a point. There is exactly one
rounding site: the mean, half away from zero. See `docs/SCORING.md`.

Standings are **replayable**: recomputing from the raw submission log twice produces
byte-identical output. That is a stronger claim than "the numbers came out right", and it is what
lets a disputed result be shown rather than argued about.

---

## Getting it running locally

You need Node 22, Docker, and about ten minutes.

```bash
git clone <this repo>
cd "Park Tudor CS Club"
npm install

cp .env.example .env          # works as-is for local development

docker compose up -d          # Postgres and Redis
npx prisma migrate deploy
npm run db:seed               # the problem bank: 125 problems, all DRAFT

./scripts/build-judge-images.sh --verify   # pulls four images and BUILDS ptcn-go:1.23
npx tsx scripts/seed-demo.ts               # a contest you can actually open

npm run dev                   # http://localhost:3000
npm run worker                # in a second terminal — nothing is judged without it
```

The seed script prints a join code. Open `/join`, use it, and you are in.

> `build-judge-images.sh` is not optional and is not a wrapper around `docker pull`.
> `ptcn-go:1.23` is built locally and exists on no registry: since Go 1.20 the standard library
> is not shipped pre-compiled, so a stock `golang` image rebuilds it on every submission — 65.8 s
> against 2.5–11.8 s warm — which blows the compile timeout and reports **CE on correct code**.

---

## Deploying

`docs/DEPLOY.md`, start to finish, written for someone who has never deployed anything: server
hardening, Docker, TLS, the OAuth redirect URIs, and a smoke test against the live domain.

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

---

## The gates

The project is gated rather than reviewed. **A gate is PASS only on real, pasted output** — "it
should pass" is FAIL, and there is deliberately no way to mark one passed by hand.

```bash
npm run verify        # runs them in order and prints a PASS/FAIL table
```

| Gate | Command | What it proves |
|---|---|---|
| G0 build | `npm run build` | it compiles for production |
| G1 typecheck | `npx tsc --noEmit` | strict TypeScript, no `any` |
| G2 lint | `npm run lint` | zero warnings |
| G3 unit | `npm test -- --run` | 340 tests, 80%+ coverage |
| G4 judge | `npm run test:judge` | 57 verdict fixtures across five runtimes |
| G5 sandbox | `npm run test:sandbox` | 18 hostile submissions contained, no leaked containers |
| G6 scoring | `npm run test:scoring:golden` | a replayed contest matches byte-for-byte |
| G7 E2E | `npx playwright test` | 89 specs through the real HTTP API |
| G8 load | `npm run test:load` | 40-submission burst latency |
| G9 a11y | `npm run test:a11y` | 32 specs, zero critical or serious axe violations |
| G13 content | `npm run test:content` | every reference solution through the real judge |

**G8 does not pass on modest hardware, and the threshold has never been lowered.** Correctness is
unaffected — 40/40 accepted, zero internal errors — but verdicts take longer than the 10 s target
by a factor that depends entirely on the host. `docs/HOSTING.md` has the arithmetic and
`docs/TODO.md` T3 has the honest summary.

---

## Layout

```
app/          Next.js App Router. Route handlers are thin: validate, delegate, respond.
lib/scoring/  Pure functions. No I/O, no clock, no randomness — time arrives as an argument.
lib/judge/    Language registry, verdict aggregation, output comparators.
worker/       The judge. One throwaway container per submission, and it reaps them.
prisma/       Schema and migrations.
content/      Authored problem statements, reference solutions and test data.
fixtures/     Judge fixtures, hostile submissions, golden standings.
docs/         PRD, scoring, auth, hosting, deployment, decisions, and the honest TODO.
```

The one-way dependency that matters: `app/` and `worker/` may import `lib/`; `lib/scoring/`
imports from neither. If scoring needs a fact, it arrives as an argument.

---

## Documentation

| File | What is in it |
|---|---|
| `docs/PRD.md` | The spec of record |
| `docs/SCORING.md` | The team formula, the rounding rule, and the worked example |
| `docs/AUTH.md` | Sessions, the four sign-in paths, and every cookie attribute |
| `docs/HOSTING.md` | What one submission costs, and what machine to run it on |
| `docs/DEPLOY.md` | Getting it onto a server |
| `docs/DECISIONS.md` | Decisions and why, including the ones that turned out wrong |
| `docs/TODO.md` | **The honest list.** Read it before assuming a feature works |
| `SECURITY.md` | Accepted findings, each with its reasoning |
| `CLAUDE.md` | Rules that are easy to get wrong in this codebase |

**`docs/TODO.md` is not a backlog, it is a disclosure.** Several things there are built and tested
but not reachable, and a couple are reachable but wrong on particular hardware.

---

## Original problems only

Problem statements, editorials and test data are **never** copied from HackerRank or anywhere
else. The seed file imports titles and contest history only; every problem stays `DRAFT` until an
original statement and own-generated test data exist, and the API — not merely the UI — refuses a
`DRAFT` problem in a live contest.

A reference solution that passes locally is not a judgeable problem. Only G13 proves a problem
survives the real judge, and that distinction once hid eight unsolvable problems and one that
failed every correct submission.
