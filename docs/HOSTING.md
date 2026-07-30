# HOSTING — choosing the machine that runs Coding Night

Written to support one decision: **what hardware the judge runs on**. Every number here was
measured on the build machine, and §6 tells you how to re-measure on a candidate host in about
ten minutes so you are not taking these figures on faith.

Short version: **the build laptop misses the throughput target by 11×, and the cause is Docker
Desktop's VM, not the code.** A modest Linux box with native Docker should clear it. Read §5
before buying or borrowing anything.

---

## 1. What has to be true

`docs/PRD.md` §12, gate G8: **40 concurrent submissions, zero dropped jobs, zero `IE`
verdicts, p95 verdict latency under 10 seconds.**

That 40 is not arbitrary — PRD §7.4 derives it from how a Coding Night actually ends, with
20–40 people all submitting in the last few minutes. The 10 seconds is what keeps a student
looking at the screen instead of asking an organizer whether it broke.

Verdict latency is measured from the moment the browser sends `POST /api/submissions` to the
moment a verdict is visible. It includes the enqueue, the wait in the queue, container
creation, compilation, every test, and reconciliation — because that is what the student
experiences. It is not "how long the program ran".

---

## 2. What one submission costs

Since the per-submission container change, judging an interpreted submission is **exactly one
container** (PRD §7.1's wording, singular) — down from one per test case. A compiled submission
costs two: one to build, one to run. Inside them:

| Step | Cost on the build machine |
|---|---|
| Container creation | **2,400 – 15,600 ms** — measured, 6.5× spread |
| Compile / syntax check | Python ~300 ms · Java ~3,000 ms (cold `javac`) · C++ ~2,000 ms · Go 2,500 – 11,800 ms *(warm cache; 65,800 ms cold — see §6 step 2)* |
| Each test case | Python 62 – 154 ms · Java 480 – 667 ms · C/C++ 10 – 250 ms · Go 27 – 204 ms |
| **Total, 3-test Python problem** | **~7,000 – 9,000 ms**, of which ~90% is container creation |
| **Total, 3-test compiled problem** | **~14,000 – 36,000 ms** — two containers, since a compiled language builds in its own |

A compiled language costs **two** containers, not one: the build runs at the compiler's memory
and CPU limits, then the program runs at the problem's. A cgroup has one memory cap, so a
single container cannot both give `javac` its 1 GB and hold the student's program to 256 MB —
sized for the compiler, an 800 MB program is never OOM-killed and MLE detection silently stops
working. PRD §7.1's "one ephemeral container per submission" governs the *untrusted program*,
which still gets exactly one.

On this host that doubling matters enormously, because container creation is the dominant cost.
On a host where creation is ~200 ms it is close to irrelevant.

The shape of that table is the entire finding. **Container creation dominates by an order of
magnitude over the work being judged.** A student's algorithm is a rounding error next to the
cost of starting the box it runs in.

Interpreter startup inside an already-created container, for a program that does nothing:

```
Python   1006, 1042, 1114, 1319, 1377, 1418, 1505, 1651 ms   (median 1377)
Java     1010, 1479, 1815, 2374, 3659, 5342 ms               (5.3× spread)
```

Those numbers are why `RUNTIMES` in `lib/judge/runtimes.ts` adds a fixed per-runtime startup
budget instead of multiplying the problem's time limit. On a faster host they should drop
sharply and should be **re-measured, not guessed** — §6 covers it.

---

## 3. The arithmetic

With one container per submission and a worker concurrency of 4:

```
burst                     40 submissions  =  40 containers
worker concurrency         4
sequential slots          40 / 4          =  10
therefore, per container   10 s / 10 slots =  1.0 s   to hit a 10 s p95
measured per container    111.6 s * 4 / 40 = 11.2 s
                                             ------
shortfall                                     11×
```

Put another way: **each container has a one-second budget and currently takes eleven.**
Container creation alone is 2.4–15.6 s, so it exceeds the entire budget before any code runs.
No amount of tuning the judge closes an 11× gap when one unavoidable step is 2–15× the target
on its own.

### Measured G8 progression on this machine

Each row is a real run, in order. Included because it shows what is a code problem and what is
not — the first three gaps were bugs and were fixed; the last one is the machine.

| Change | p95 | Sampled | IE | Note |
|---|---|---|---|---|
| Per-test containers, connection leak | — | 5/40 | — | 35 refused: `too many clients already` |
| Connection pool fixed | 290,783 ms | 32/40 | 1 | 8 still queued at the deadline |
| One container per submission | 148,757 ms | 40/40 | 5 | 2.0× faster |
| BullMQ `returnvalue` race fixed | **110,767 ms** | **40/40** | **1** | 2.6× total |
| Target | **10,000 ms** | 40/40 | 0 | **11× away** |

Enqueue p95 is **991 ms** and every submission is accepted, so the API, Postgres and Redis are
comfortably fine. The judge is the whole bottleneck.

---

## 4. Why Docker Desktop is the cause

On macOS, Docker Desktop runs the daemon inside a Linux VM. Every `docker run` crosses a
virtualisation boundary and every bind mount crosses a filesystem-sharing layer. That is where
2.4–15.6 s goes, and it is also why the figure *varies by 6.5×* run to run — a native Linux
daemon has no such boundary and its container creation is consistently in the low hundreds of
milliseconds.

Two independent observations support this rather than "the laptop is slow":

- The **work** is fast. Python test cases execute in 62–154 ms inside a container that already
  exists. The machine has no trouble running the code.
- The variance is enormous and unrelated to load. A cost that swings 2.4 s to 15.6 s for an
  identical operation is scheduling and I/O layering, not CPU.

This host also runs an unrelated container stack alongside the judge, which PRD §14 explicitly
says to avoid. That inflates the tail but does not explain the floor.

---

## 5. Recommendation

**A dedicated Linux machine with native Docker, 8 cores, 16 GB RAM, SSD.** Not a Mac, and not
a VM on a Mac.

Reasoning, in order of how much each point matters:

1. **Native Docker, not Docker Desktop.** This is the decision. Container creation drops from
   2.4–15.6 s to roughly 100–200 ms — a 10–100× improvement on the step that is currently 90%
   of the cost. Nothing else comes close.
2. **8 cores, so worker concurrency can be 8.** At 8 slots the burst is 5 sequential rounds
   rather than 10, halving p95 again and leaving margin for a slow submission. The worker
   concurrency is `JUDGE_CONCURRENCY` in `.env`.
3. **Dedicated to the judge.** PRD §14 already says this. The judge mounts the Docker socket
   (see the comment on that line in `docker-compose.yml`), which is effectively root on the
   host — so it should not share a machine with anything you care about, for security as much
   as for timing.
4. **16 GB RAM.** Eight concurrent containers at a 256 MB cap is 2 GB, plus Postgres, Redis,
   the web process and the images. 8 GB would work; 16 GB stops you thinking about it.
5. **SSD.** Image layers and bind mounts are I/O bound during creation.

**Projected on that hardware:** ~200 ms creation + ~300 ms compile + ~300 ms of tests ≈ **0.8 s
per container**. At concurrency 8, 40 submissions is 5 rounds × 0.8 s ≈ **4 s p95** — inside
the 10 s target with room to spare. This is a projection from measured component costs, not a
measurement. **Verify it with §6 before relying on it.**

### Things that will not fix it

- **Tuning the judge.** Already done: one container per submission was a 2× win and the code is
  now at the spec's minimum of one container per submission. There is no 11× left in software.
- **Raising `JUDGE_CONCURRENCY` on this laptop.** More concurrent containers on a host whose
  bottleneck is container creation mostly adds contention; the 6.5× variance is already a
  symptom of it.
- **Reusing containers between submissions.** It would work and it is forbidden: PRD §7 and
  CLAUDE.md require a fresh container per submission, and G5's containment guarantees depend
  on it. Do not do this.
- **Lowering the target.** 10 s is a product requirement about what a student will tolerate,
  not a tuning knob.

---

## 6. Re-measure on the candidate host — about ten minutes

Do this on the actual machine before committing to it. Steps 1–3 take a few minutes and answer
the question on their own; step 4 is the real gate.

### Step 1 — is container creation fast? (2 minutes)

This single number decides the host. Nothing else in this document matters if it is slow.

```bash
docker pull python:3.12-slim
for i in 1 2 3 4 5 6; do
  n="probe-$i"
  docker run --name "$n" --network=none --read-only \
    --tmpfs=/tmp:rw,noexec,nosuid,size=16m --user=65534:65534 --cap-drop=ALL \
    --security-opt=no-new-privileges --pids-limit=64 --memory=256m --memory-swap=256m \
    --cpus=1 python:3.12-slim python -c 'print(1)' >/dev/null 2>&1
  docker inspect "$n" --format '{{.State.StartedAt}} {{.State.FinishedAt}}'
  docker rm -f "$n" >/dev/null
done
```

Then time the whole loop with `time`. **Wall time per iteration minus the in-container duration
is your container-creation cost.**

| Result | Verdict |
|---|---|
| under 500 ms | Excellent. G8 should pass comfortably. |
| 500 ms – 1 s | Fine. Expect p95 in the low seconds. |
| 1 – 3 s | Marginal. Raise `JUDGE_CONCURRENCY` and re-check with step 4. |
| over 3 s | Same problem as the build laptop. Choose a different host. |

### Step 2 — bring the stack up (3 minutes)

```bash
cp .env.example .env          # set SESSION_SECRET and ADMIN_PASSCODE
docker compose up -d postgres redis
npx prisma migrate deploy
npm run db:seed               # 125 problems, all DRAFT

# Pulls the four stock runtime images AND builds ptcn-go:1.23. Not optional, and not
# just a convenience wrapper around `docker pull` — see the note below.
scripts/build-judge-images.sh --verify
```

**Why Go needs a build step.** Since Go 1.20 the standard library is not shipped
pre-compiled; the build cache is populated on first build. Every submission gets a fresh
container with an empty cache, so the stock `golang` image recompiles std *every single
submission*: measured in-container on the build laptop at **65.8 s cold against 2.5–11.8 s
warm**. `docker/go/Dockerfile` bakes a world-readable cache into the image.

This failure is silent in the worst way. A cold build does not error — it exceeds
`compileTimeoutMs` and reports **CE on a correct program**. `--verify` compiles a known-good
file and fails if it takes longer than 30 s, which is the only cheap way to tell a warm cache
from a cold one. Run it.

If `--verify` fails, the usual cause is a flag mismatch: build flags are part of Go's cache
key, so any flag in the registry's `compileCommand` that `docker/go/Dockerfile` did not also
use misses the entire cache.

### Step 3 — re-measure the startup budgets (2 minutes)

`RUNTIMES` in `lib/judge/runtimes.ts` is sized for the build laptop and will be far too
generous here. There are **five** budgets, one per runtime — `python312`, `jdk21`, `gcc14`,
`node22`, `go123`. The variants share them: Java's four language levels are one JVM and the
three GCC standards are one compiler, so there are five numbers to measure and not ten.

Run the loop from step 1 against each runtime's image, take the **maximum** in-container
duration, and set `startupBudgetMs` above it with margin. Measure under churn, not on an idle
host — the contest is the churn.

Do not guess. A budget below real startup fails correct solutions as TLE, which is how this
project lost 8 of 20 problems once already: Python was set to 1000 ms against a measured floor
of 1006 ms.

Two of the five are currently genuine measurements (`python312`, `jdk21`); `gcc14`, `node22`
and `go123` are generous estimates. See `docs/TODO.md` T6 for which is which.

### Step 4 — run the gate (5 minutes)

```bash
npm run build
npm start &                   # or npm run dev
npm run worker &              # needs the Docker daemon
npm run test:load             # G8
```

It prints the full latency distribution, p95 by nearest rank, dropped-job count and IE count,
and exits non-zero if any condition fails. **Do not edit the threshold** — a failing number you
can see is worth more than a passing one you arranged.

Then run everything: `npm run verify`. Expect ~20 minutes; G4 and G13 are container-bound.
Note that **G8 and G13 must never run concurrently** — both spawn containers and interleaving
them corrupts G8's p95, which is the only thing G8 measures. `scripts/verify.sh` sequences them.

---

## 7. If no better host is available

The night can still run. G8 failing means the judge is slow under a simultaneous burst, not
that it is wrong — G4 (27 verdict fixtures), G5 (7 hostile submissions contained) and G13 (20
reference solutions) all pass on this laptop, so verdicts are correct.

What to do instead, in order:

1. **Tell the students the queue is deep near the end.** A visible queue position is far less
   alarming than a spinner. The admin live console already shows queue depth.
2. **Raise `JUDGE_CONCURRENCY`** and re-run step 4. It will help somewhat even here.
3. **Run more than one worker process.** They share the queue; BullMQ handles the distribution.
4. **Shorten problems' test-case counts for the final round.** Fewer tests per submission is
   directly less work inside the one container.
5. **Do not reuse containers, and do not lower the threshold.** The first breaks containment,
   the second hides the problem from whoever runs it next year.
