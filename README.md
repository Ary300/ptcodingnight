# Park Tudor Coding Night

The contest platform for Coding Night. It hosts the problems, judges submissions automatically in a
sandbox, and scores the night — replacing HackerRank plus the spreadsheet that used to reconcile it.

**Written for someone who has never seen this repo.** If you are that person and something below
does not work, that is a bug in this file; say so.

---

## 1. What it actually is

A [Next.js](https://nextjs.org) web app, a Postgres database, a Redis queue, and a **judge worker**
that runs student code inside throwaway Docker containers.

The thing that makes it different from a generic judge is the scoring. **Coding Night is a team
contest**, and it scores like this:

```
team score = (sum of every member's points, group problems included) / team size
             + side activity points
```

HackerRank cannot do that — it ranks individuals on identical problem sets, while Coding Night puts
players on *different* sets and then averages each team. That single mismatch is why the spreadsheet
existed, and it is what this platform replaces. The full rules, including a worked example, are in
[`docs/SCORING.md`](docs/SCORING.md).

### How a night runs

| Round | What happens |
|---|---|
| **Round 1** (45 min) | Each player is **randomly assigned** one of the parallel problem sets A–D. Every set holds one Easy, one Medium and one Hard problem, and the sets are calibrated to be equally hard. A player cannot read the sets they were not assigned. |
| **Round 2** | Two harder **group** problems. The team solves them together; one submission counts for everyone. |
| **Side activities** | Metal puzzle, train tracks, Connections. Not code — an organizer types the points in. |

### Where things live

```
app/          Next.js routes. Pages and the HTTP API. Route handlers are thin.
lib/scoring/  The scoring engine. Pure functions, no database, no clock. THE only place points
              are computed.
lib/judge/    runtimes.ts — the language registry. Adding a language is a line here.
lib/contest/  Everything else the API needs: auth, sessions, problems, standings.
worker/       The judge. Spawns one container per submission and reaps it.
prisma/       Database schema and migrations.
content/      The problems: statements, reference solutions, test data.
fixtures/     Test fixtures, including the golden scoring contest.
docs/         PRD (the spec), SCORING, HOSTING, AUTH, DESIGN, DECISIONS, TODO.
```

---

## 2. Running it locally

### What you need first

- **Node 22 or newer** — `node --version`
- **Docker Desktop, running** — `docker ps` must print a table rather than an error. The judge
  cannot work without it.

### Five commands

```bash
git clone <this repo> && cd "Park Tudor CS Club"
npm install

cp .env.example .env          # then open .env and set the secrets it lists — at minimum
                              # ADMIN_PASSCODE, POSTGRES_PASSWORD and REDIS_PASSWORD.
                              # docker compose REFUSES TO START without them, on purpose:
                              # the placeholders used to be live credentials.
docker compose up -d postgres redis
npx prisma migrate deploy     # create the tables
npm run db:seed               # load the problem list from data/problems_seed.csv
```

Then build the judge's container images. **This is not optional and it is not just `docker pull`:**

```bash
scripts/build-judge-images.sh --verify
```

Go needs an image we build ourselves. Since Go 1.20 the standard library is not shipped
pre-compiled, so a fresh container would rebuild it on *every submission* — 66 seconds instead of
3, and it fails by reporting "compile error" on correct code. `--verify` proves the pre-warmed cache
is actually being used. Expect it to take a few minutes the first time.

Now start the two processes, in two terminals:

```bash
npm run dev       # the web app, at http://localhost:3000
npm run worker    # the judge
```

Open <http://localhost:3000>. The join code comes from whatever contest you seeded.

### Is it working?

```bash
npm run verify
```

That runs every gate and prints a PASS/FAIL table. It takes roughly 20–30 minutes because the judge
gates start real containers. If you only want a quick check:

```bash
npx tsc --noEmit && npm run lint && npm test -- --run
```

---

## 3. Running a contest night

### A week before

1. **Pick the judge machine and test it there.** This matters more than anything else in this
   section. Read [`docs/HOSTING.md`](docs/HOSTING.md) — it has a ten-minute procedure for checking a
   candidate machine, and it explains why the laptop this was built on is not good enough.
   **In particular, read §5: on a slow host Java time limits stop working, which is a scoring
   problem rather than a speed one.**
2. **Build the images on that machine**: `scripts/build-judge-images.sh --verify`.
3. **Author the problems** you plan to use (§4 below), and run `npm run test:content` until every
   reference solution passes through the real judge.

### On the day

1. **Start everything**: `docker compose up -d`, then confirm `npm run verify` at least gets through
   G0–G6.
2. **Create the contest** in the admin UI at `/admin`: name, start and end times, freeze time, join
   code, and the scoring flags.
3. **Create the teams** and put every participant on one.
   **Check the team sizes.** Team size is the divisor in the team score, so a wrong roster produces
   a wrong result rather than a cosmetic error. The admin UI flags a team of one.
4. **Create the problem sets** A–D and slot three problems into each.
5. **Assign the sets** — `POST /api/admin/contests/{id}/assign-sets`. This is seeded and recorded, so
   if a student disputes their set you can re-derive the assignment in front of them with
   `GET` on the same URL. Do not re-run it after the round starts without meaning to; it will move
   students off problems they have already begun, and it refuses unless you ask explicitly.
6. **Put the board on the projector**: `http://<host>:3000/projector?contest=<contest-id>`. No login.
7. **Run the contest.** Students join at `/join` with the code on the board.
8. **Enter side-activity points** at `/admin/side-activities?contest=<contest-id>` as they happen.
9. **Freeze the board** before the end so the final standings are a reveal.
10. **Unfreeze** for the awards, and export the results from the admin awards screen.

### If something goes wrong

| Symptom | Look at |
|---|---|
| Submissions stay "queued" forever | Is `npm run worker` running? Is Docker running? |
| Everything is `IE` | The worker log. `IE` means the judge broke, not the student. |
| A student says "that problem is in a set you were not assigned" | Correct — unless set assignment never ran. Check `GET /api/admin/contests/{id}/assign-sets`. |
| A student cannot sign in | Use the join code. It has no dependency on Google or GitHub, which is why it exists. |
| Someone's session needs cutting off | `POST /api/admin/sessions` with a `participantId` and a reason. Takes effect on their next request. |
| Correct Java solutions time out | `docs/HOSTING.md` §5. Raise the problem's time limit as a stopgap. |

---

## 4. Adding a problem

Problems live in `content/problems/<slug>/`:

```
content/problems/solve-me-first/
├── problem.json     metadata: title, difficulty, limits, allowed languages
├── statement.md     the statement, in Markdown
├── reference.py     a correct solution
├── generator.py     makes the test inputs
└── tests/           the generated .in / .out files
```

**Write the statement yourself.** Never paste one from HackerRank or anywhere else. The seed file
imports *titles and history only*, so we can see what has been used before; the statements and test
data are ours. A problem stays in `DRAFT` — and the API refuses it in a live contest, not just the
UI — until it has an original statement and its own test data.

Steps:

1. `mkdir content/problems/my-problem` and write `problem.json`, `statement.md`, `reference.py`.
2. Write `generator.py` so the test data can be regenerated rather than being a mystery blob.
3. Generate the tests, then verify:

   ```bash
   npm run test:content
   ```

   This runs **every** reference solution through the **real judge**, in a real container. It is the
   only thing that proves a problem is actually solvable — running `python3 reference.py` on your
   own machine proves the algorithm and nothing else. That distinction previously hid 8 unsolvable
   problems and 1 that failed every correct submission.
4. Publish the problem in the admin UI, and slot it into a contest and a set.

---

## 5. Backups and restore

`docker compose up -d` starts a `backup` service that runs `pg_dump` **every hour** into
`./backups/`, named `ptcn-YYYYMMDD-HHMMSS.dump`.

### Check the backups exist before the night

```bash
ls -lh backups/
```

An empty directory means the service is not running. Fix that before the contest, not after.

### Restore

```bash
# 1. Stop everything that writes to the database.
docker compose stop web worker

# 2. Restore. --clean drops the existing objects first; without it you get
#    "already exists" errors and a half-restored database, which is worse than either state.
docker compose exec -T postgres \
  pg_restore -U ptcn -d ptcn --clean --if-exists < backups/ptcn-20260315-190000.dump

# 3. Start back up.
docker compose start web worker
```

### Restoring mid-contest

Two things to know:

- **Standings are not backed up and do not need to be.** They are recomputed from the submission
  log every time, so restoring the submissions restores the scores exactly. Nothing that cannot be
  re-derived is stored.
- **Everyone will be signed out** for any session created after the dump was taken, because sessions
  are rows in Postgres. Students rejoin with the same join code and the same display name and get
  their submissions back. Tell the room before you restore, not during.

### Practise it once

Restore a dump into a scratch database before the night. A backup nobody has ever restored is a
hypothesis, not a backup.

---

## 6. Where to read next

| File | What it answers |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | What this is supposed to do. The spec of record — read it before any substantial change. |
| [`docs/SCORING.md`](docs/SCORING.md) | Exactly how a team score is computed, with the arithmetic written out. |
| [`docs/HOSTING.md`](docs/HOSTING.md) | Which machine to run the judge on, and why. Includes the Java time-limit problem. |
| [`docs/AUTH.md`](docs/AUTH.md) | Who can sign in and how. Four paths. |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Colours, type, contrast floors. |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Why things are the way they are. |
| [`docs/TODO.md`](docs/TODO.md) | **What is still broken or missing.** Honest, and worth reading before you trust a feature. |
| [`SECURITY.md`](SECURITY.md) | Security review findings and the ones knowingly accepted. |
| [`CLAUDE.md`](CLAUDE.md) | The rules that are easy to get wrong in this codebase. |

---

## 7. Known limitations

Read `docs/TODO.md` for the current list. The two that would affect a contest today:

- **Verdict latency does not meet the target on a shared machine.** Gate G8 wants a p95 under 10
  seconds and this laptop measures 110–283 seconds depending on how busy it is. Judging is correct —
  every submission gets the right verdict — but students wait. `docs/HOSTING.md` is the fix.
- **Java time limits are not enforceable on a slow host.** A 2-second Java problem effectively allows
  49 seconds, so a too-slow Java solution passes when the same idea in Python would not. This is a
  scoring problem, not a speed one. `docs/HOSTING.md` §5.
