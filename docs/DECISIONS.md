# DECISIONS

Ambiguities resolved during the autonomous build, with reasoning. Per `docs/KICKOFF.md`,
each entry picks the option that best serves `docs/PRD.md` §3 success criteria rather than
stopping to ask.

Format: what was ambiguous → what I chose → why → what would change my mind.

---

## D1 — Docker daemon is not running on this machine (Phase 0)

**Ambiguous:** Docker 29.1.2 and Compose v2.40.3 are installed, but `docker ps` fails:
`failed to connect to the docker API at unix:///Users/aryavdas/.docker/run/docker.sock`.
Gates G4, G5, G8, and G10 all require a live daemon. G5 in particular is the gate KICKOFF
says invalidates the entire project if it fails.

**Chosen:** Proceed through Phases 1 and 3 (skeleton, contracts, scoring engine), which need
no daemon. Build Phase 2's judge code and fixtures in full, but treat G4/G5 as **NOT RUN**
— never PASS — until a daemon is up. Do not simulate, mock, or stub the container boundary
to make those gates report green; a mocked sandbox gate is worse than an honest NOT RUN
because it produces false confidence in exactly the component the PRD calls highest-risk.

**Why:** PRD §14 lists "an overnight autonomous build produces something that compiles but
does not work" as a named risk, mitigated by G4–G8 being *behavior* tests. Faking the
behavior test removes the mitigation. Phases 1 and 3 are genuinely unblocked, so the night
is not wasted.

**Changes my mind:** Docker Desktop starting. Then G4/G5 run for real and Phase 2 closes
properly. This is the single highest-value thing a human could do for this build.

**RESOLVED (end of Phase 0):** The daemon is up. `docker ps` exits 0, Server Version 29.1.2,
Docker Desktop. **Baseline `docker ps -a` count is 0** — that is the number G5 must return
to after every hostile fixture run. G4, G5, G8, and G10 are unblocked.

Standing requirement carried into Phase 2: `docker ps` is verified at the *start* of the
phase and **hard-fails** if the daemon is down. The judge is never built or "tested" against
an absent daemon, because the failure mode is a suite that silently passes by not running.
`scripts/verify.sh` implements this check and records the `docker ps -a` baseline.

**NEW BLOCKER (Phase 1) — the daemon is up but image pulls hang.** `docker ps` exits 0 and
`docker info` reports a healthy server, but `docker pull redis:7-alpine` produced **zero
bytes of output in over 20 minutes**, and `docker compose up -d postgres redis` never
created a container. Diagnosis so far:

- Not a general network fault: npm installed ~550 packages normally in the same session.
- Not registry unavailability: `curl https://auth.docker.io/token` returns 200 in 0.13s and
  `curl https://registry-1.docker.io/v2/` returns 401 (the expected auth challenge) in 0.6s.
- `docker info` shows pulls routed through Docker Desktop's internal proxy:
  `HttpProxy: http.docker.internal:3128`, `HttpsProxy: http.docker.internal:3128`. That
  proxy inside the Desktop VM is the most likely stall point.
- Disk is not the issue: 159 GB free.

**Consequence:** no Postgres, so the initial migration could not be *applied*, and no
runtime images, so Phase 2 cannot run a single judge container. G4, G5, G8, and G10 remain
NOT RUN.

**Worked around, not faked:** the initial migration was generated offline with
`prisma migrate diff --from-empty --to-schema --script` and is committed
(`prisma/migrations/00000000000000_init/`, 12 tables and 8 enums). The seed dedup is proven
against the real CSV by `tests/unit/seed-merge.test.ts`, which needs no database. Neither
substitutes for actually running them — both are recorded as NOT RUN, not PASS.

**Unblocks when:** Docker Desktop can pull an image. Worth trying in Settings → Resources →
Proxies (disable the manual/system proxy), or a Docker Desktop restart. Verify with
`docker pull redis:7-alpine`; it should complete in seconds.

---

## D2 — The seed CSV has 136 rows but 125 distinct titles (Phase 0)

**Ambiguous:** Eleven titles appear twice. `Problem.slug` must be unique, so a naive
title-keyed seed either crashes on a unique constraint or silently drops rows.

**Chosen:** One `Problem` per normalized title. Division, difficulty, and slot live on
`ContestProblem`, which is where PRD §5 already puts them. The seeder normalizes
(trim, collapse whitespace, casefold) to derive the slug, upserts the `Problem`, and creates
one `ContestProblem` per CSV row that carries a division.

**Why:** Nine of the eleven repeats are not errors at all — they are the same problem used
in both divisions at different difficulties, which is exactly the relationship
`ContestProblem` exists to model:

| Title | Row 1 | Row 2 |
|---|---|---|
| Bill Division | Intermediate / M | Advanced / E |
| Gaming Array | Intermediate / H | Advanced / M |
| Ice Cream Parlor | Intermediate / M | Advanced / E |
| Morgan and a String | Intermediate / H | Advanced / M |
| Circular Array Rotation | solved-in-past | Intermediate / E |
| Day of the Programmer | solved-in-past | Intermediate / H |
| Designer PDF Viewer | solved-in-past | Intermediate / M |
| Encryption | solved-in-past | Advanced / M |

Collapsing them to one `Problem` preserves the history flags the PRD §8 problem picker
needs while keeping the slug unique.

**Changes my mind:** Nothing likely — this is the modeling the PRD already implies.

---

## D3 — Three of the five `group` rows are exact duplicates (Phase 0)

**Ambiguous:** PRD Appendix A and Appendix B both say the group round is **five** hard
problems. The CSV has five `type=group` rows, but only **three distinct** titles:

```
Insertion Sort Advanced Analysis   (x2, byte-identical rows)
Fraudlent Activity Notifications   (x2, byte-identical rows)
Cards Permutation                  (x1)
```

Appendix A's own prose names only three: "five hard problems (Insertion Sort Advanced
Analysis, Fraudulent Activity Notifications, Cards Permutation)". So the PRD is internally
inconsistent — the count says five, the enumeration says three.

**Chosen:** The group round is **three** problems. The duplicate rows are a spreadsheet
export artifact, deduped on seed.

**Why:** Three distinct titles is the only reading supported by the actual data, and the
PRD's own enumeration agrees. Inventing two more group problems to reach five would mean
authoring problems nobody chose. The hint economy is unaffected: 60 warmups fund far more
than the 9 hints (3 problems × 3 hints) the round can absorb at 2 warmups per hint.

**Correction (same phase):** an earlier draft of this entry also claimed `sum67` was a
duplicate, giving 59 warmups instead of 60. That was wrong. `sum67` appears once with
`notes=Python` and once with `notes=Java` — CodingBat genuinely offers that exercise in
both languages, so they are two distinct warmups that happen to share a title. All 60
warmups are real. This is why the dedup key is `(title, language)` for `codingbat` and
`title` alone elsewhere; see D6.

PRD §15 and §16 have been corrected to match (five → three, plus a distinct-count column).

**Consequence for G6:** the golden fixture covers the 2 divisions × 3 slots × 4 participants
grid from Appendix A, which is fully populated and unaffected by this.

**Changes my mind:** An organizer naming the two missing group problems.

---

## D4 — `Fraudlent Activity Notifications` is a typo (Phase 0)

**Ambiguous:** The CSV contains both spellings, as different problem types:

```
Fraudulent Activity Notifications   type=algorithm  past_status=used-but-zero-points
Fraudlent  Activity Notifications   type=group      past_status=group-problem   (x2)
```

Left alone, the seeder creates two `Problem` rows for one problem and the "nobody scored a
point" flag fails to surface on the group-round copy.

**Chosen (revised — fixed at source):** The typo is now corrected **in
`data/problems_seed.csv` itself**, on organizer approval. Both `group` rows read
`Fraudulent Activity Notifications`, matching their `used-but-zero-points` twin on line 29.
No seeder-side correction map is needed.

The three rows now merge to one `Problem` carrying both facts: it is a group-round problem
*and* it was used before with zero points scored. Distinct titles dropped 125 → 124 as a
result, and it is the one title in the file spanning two `type` values.

**Why:** PRD §8 says the `used-but-zero-points` flag exists to be surfaced loudly in the
picker so organizers stop repeating problems nobody could solve. That warning is most
valuable on precisely this problem. A fuzzy matcher would risk silently merging genuinely
distinct titles; an explicit map of known corrections is auditable.

**Changes my mind:** Discovering these are actually two different HackerRank problems.

---

## D5 — CLAUDE.md described a codebase that does not exist (Phase 0)

**Ambiguous:** `/init` is meant to reconcile CLAUDE.md with the repo. But the repo has no
code, so a literal `/init` regeneration would have thrown away a detailed, spec-derived
CLAUDE.md and replaced it with a near-empty one.

**Chosen:** Kept the existing document and its "Rules that are easy to get wrong here"
section verbatim, per KICKOFF's explicit instruction. Added a **Current state** section
saying plainly that no application code exists yet and that Commands/Architecture are a
target contract. Fixed a real error — the file pointed at `PRD.md`, but the file is at
`docs/PRD.md`. Extended the rules section with D2's dedup policy.

**Why:** KICKOFF says extend that section, never delete it. Reconciling "with the repo as it
actually is" is satisfied by stating the repo is empty, which is more useful to the next
agent than deleting the spec.

---

## D6 — Seed dedup key is `(title, language)` for warmups, `title` elsewhere (Phase 0)

**Ambiguous:** `Problem.slug` must be unique, but 136 CSV rows contain repeated titles. A
single title-based key looks obviously correct and is subtly wrong.

**Chosen:** Key `codingbat` rows on **`(title, language)`**, every other type on **`title`**.
136 rows → **125 distinct `Problem` records**: algorithm 71→63, codingbat 60→60, group 5→3.

**Why:** `sum67` exists as both a Python and a Java CodingBat exercise. Keying warmups on
title alone silently merges two real problems into one, costing a warmup and skewing the
hint economy that PRD §6.1 prices at 2 warmups per hint. Non-warmup repeats are the
opposite case — genuinely one problem appearing in several contest slots — and must
collapse, with division/difficulty/slot living on `ContestProblem` per PRD §5.

Seeding must be **idempotent**: running `db:seed` twice yields 125 problems, not 250. G10's
cold start replays it on a fresh clone.

**Changes my mind:** Nothing. Verified directly against the CSV.

---

## D7 — Design tokens move to the start of Phase 4 (Phase 0, approved)

**Ambiguous:** KICKOFF orders Phase 4 (build frontend) before Phase 5 (design pass), which
builds the UI twice — agents ship default-Tailwind components, then Phase 5 rewrites them.

**Chosen, with organizer approval:** `docs/DESIGN.md` — the token system only: 4–6 named hex
values, display/body/monospace faces, a stated type scale, and the layout concept — is
written **before any frontend agent starts**, at the top of Phase 4. Phase 5 keeps the
projector leaderboard signature moment, the rank-change and unfreeze motion, and the polish
pass.

**Why:** Tokens are cheap to decide and expensive to retrofit. Three frontend agents
building against real tokens from their first commit produce a coherent UI; three agents
building against defaults produce three dialects that Phase 5 must reconcile. No gate is
skipped or reordered — G9 still runs in Phase 5.

**Changes my mind:** Nothing; approved explicitly.

---

## D8 — Test data lives as file paths, not DB columns (Phase 1)

**Ambiguous:** PRD §5 sketches `TestCase` with `input, expectedOutput` fields, but the prose
directly beneath says test data is "stored as files on disk (referenced by the DB), not as
giant DB blobs, so large cases stay cheap."

**Chosen:** `TestCase.inputPath` and `TestCase.expectedOutputPath`, resolved against
`TEST_DATA_ROOT`. The field-list shorthand loses to the explicit constraint.

**Why:** The constraint is the design intent; the field list is a sketch. Storing a 1 GB
expected output as a Postgres column would also make every `SELECT *` in the judge path
catastrophically slow, which fights the G8 target of p95 under 10 seconds.

---

## D9 — Prisma 7 moves the datasource URL out of the schema (Phase 1)

**Ambiguous:** `datasource { url = env("DATABASE_URL") }` is rejected by Prisma 7:
"The datasource property `url` is no longer supported in schema files."

**Chosen:** Adopt the Prisma 7 pattern — `prisma.config.ts` supplies the URL to Migrate,
and the client receives it through the `@prisma/adapter-pg` driver adapter in `lib/db.ts`.

**Why:** The alternative was pinning Prisma 6 to keep the familiar pattern. Rejected:
starting a brand-new project on a deliberately superseded major means the first maintainer
inherits a migration. The adapter costs two extra dependencies (`@prisma/adapter-pg`, `pg`)
and one config file.

---

## D10 — Scoped dependency overrides; one advisory accepted (Phase 1)

**Ambiguous:** A clean install reported 12 high-severity advisories. `npm audit fix --force`
"resolves" them by installing `next@9.3.3` — a seven-major downgrade.

**Chosen:** Scoped `overrides` for `postcss` (>=8.5.24), `sharp` (>=0.35.3), and
`brace-expansion` (5.0.8 under `minimatch@10`, 1.1.16 under `minimatch@3`). That closes
everything reachable and takes 12 to 9. The remaining 9 are one advisory reported across
the ESLint chain; accepted and documented in `SECURITY.md` A1.

**Why:** A first attempt pinned `brace-expansion` to `^5.0.8` globally, which crashed ESLint
outright (`TypeError: expand is not a function`) because `minimatch@3` expects the v1/v2
default-function export. The scoped override gives each consumer a version it can actually
load. The residual advisory is a DoS triggered by malicious *glob patterns*; every glob here
is one we author, ESLint is a devDependency absent from the production image, and no student
submission can reach it. Downgrading the web framework to silence it would be a strictly
larger regression.

**Changes my mind:** ESLint dropping `minimatch@3`, or a `1.1.17` backport.

---

## D11 — Removed the scaffold's Google-hosted webfonts (Phase 1)

**Ambiguous:** `create-next-app` wires `next/font/google` (Geist Sans + Mono) into the root
layout by default.

**Chosen:** Removed, falling back to a system font stack until `docs/DESIGN.md` names faces
at Phase 4a.

**Why:** Two reasons, either sufficient. PRD §11 asks for typography that carries the
personality rather than a framework default — Geist is the definition of a default here.
And `next/font/google` fetches from Google at build time, which is a network dependency in a
project whose defining constraint is that the night has no internet. Whatever DESIGN.md
picks must be self-hosted.

---

## D12 — "Rejected submission" means non-`AC`, excluding `IE` (Phase 3)

**Ambiguous:** PRD §6.1 charges "5 minutes per rejected submission" without ever defining
*rejected*.

**Chosen:** A rejection is any judged verdict that is not `AC`. `CE` counts. **`IE` never
counts**, and `IE` submissions are dropped from scoring entirely — no score, no penalty, no
effect on the last-score-increase time.

**Why:** `IE` means the judge failed, so we do not actually know whether the submission was
correct. Charging a student five minutes for our own infrastructure fault would contradict
PRD §7.2, which says `IE` is never surfaced as a student-facing failure — a penalty is a
student-facing failure by any reasonable reading. `CE` is different: it is a real failed
attempt, and the student can compile locally before submitting.

Pinned in `lib/scoring/verdicts.ts` so it is decided in exactly one place.

---

## D13 — Penalty counts *every* rejection on a scored problem, including after (Phase 3)

**Ambiguous — and this one changes results.** PRD §6.1: "5 minutes per rejected submission
on a problem that is *eventually* scored above zero." It does not say whether rejections
that land *after* the participant already reached their best score count. ICPC convention
would count only attempts before the accepted one.

**Chosen:** the literal reading — every rejection on a problem whose final score is above
zero, whenever it happened.

**Why:** it is what the spec says, it is trivial for a student to verify by hand ("every
wrong submission on a problem you scored on costs five minutes"), and quietly departing from
explicit spec text on a *scoring* rule is exactly how a disputed result becomes
unexplainable. Under partial credit a student genuinely can keep improving after first
scoring, so post-first-score attempts are real attempts at the result — unlike ICPC, where
a solve ends the problem.

> **Organizers: this is the one rule worth confirming before a live night.** Under it, a
> student who solves a problem and then submits junk an hour later loses five minutes. If
> you want the ICPC convention instead, it is a single condition in `scoreClassic`
> (`lib/scoring/index.ts`) — count the rejection only while `accumulator.bestScore` has not
> yet reached its final value — and the golden fixture changes with it: `int-a` on `int-m-a`
> submits 120 then 80, so their penalty would drop from 10 to 5 and their total penalty from
> 15 to 10.

**Note the asymmetry with ICPC**, which is deliberate rather than an oversight. The ICPC
preset does *not* charge for attempts after the solve, because under binary scoring there is
nothing left to gain and every published ICPC ruleset counts only pre-`AC` attempts.

---

## D14 — Hint cost uses integer arithmetic, and follows the grant (Phase 3)

**Ambiguous:** "each hint deducts 15% of base points" leaves rounding, accumulation, and
what happens to a grant on a non-group problem all unspecified.

**Chosen:** the cost is stored as an integer percent (15), the total is computed as
`round(hints * basePoints * 15 / 100)` — multiply in integers, divide once — and the
deduction follows the existence of a `HintGrant`, not the problem's `isGroupProblem` flag.
A problem's score is clamped at zero.

**Why the integer arithmetic:** the obvious `hints * 0.15 * basePoints` is wrong. Three
hints on a 250-point problem gives `112.49999999999999` in IEEE-754, which rounds to 112
instead of 113 — a student losing a point to binary representation. A unit test pins this.
Rounding once on the total also avoids three separate half-point roundings disagreeing with
the arithmetic an organizer does on paper.

**Why the deduction follows the grant:** in valid data, grants only exist on group problems,
so the two rules are identical. They differ only when hint issuance is buggy — and then
charging for a hint the student actually received is the safer failure than handing out free
help.

---

## D15 — The golden fixture has eight participants, four per division (Phase 3)

**Ambiguous:** PRD Appendix A lists "Player A" through "Player D" as *columns*, with rows
for both Intermediate and Advanced slots. A `Participant` belongs to exactly one division,
so either there are four people spanning both divisions (impossible under the model) or four
per division.

**Chosen:** eight participants — Player A–D in Intermediate, Player A–D in Advanced.

**Why:** it is the only reading the domain model permits, it matches Appendix A's "four
participants per slot", and PRD §6.1 requires an Intermediate winner *and* an Advanced
winner — which needs a populated field in each. The 24 contest problems this produces
(2 divisions x 3 slots x 4 players) match the 24 `used-in-contest` rows in the seed CSV
exactly, including their 12/12 division split and 8/8/8 difficulty split, which is strong
evidence the reading is right.

---

## D16 — Freeze is a parameter, not a clock read (Phase 3)

**Ambiguous:** PRD §6.3 requires the public board to stop updating after `freezeAt` while
judging continues and admins see live truth. A pure function cannot check the time.

**Chosen:** `computeStandings(..., { upTo })`. The frozen public board passes
`config.freezeAt`; the admin view and the final unfreeze pass `null`. Hint grants are
filtered by the same cutoff.

**Why:** it keeps the engine pure and makes both views replayable — the dramatic unfreeze at
the end of the night is literally the same function called again without a cutoff, not a
separate code path that could disagree with the frozen one.

---

## D17 — Java gets a time budget, not just a bigger multiplier (Phase 2)

**Ambiguous:** PRD §7.2 defines `TLE` as "CPU or wall time exceeds the problem limit" and
assumes one limit per problem. Applied literally to both runtimes, every correct Java
solution fails.

**Measured, not assumed.** A Java program that does nothing but read two integers and add
them, inside the real isolation flags at `--cpus=1`:

```
1010, 1479, 1815, 2374, 3659, 5342 ms   (6 runs, 5.3x spread — pure JVM startup)
```

Python's equivalent is comfortably under a second. Container creation itself is a further
2.4–15.6 s and is excluded from these numbers.

**Chosen:** `effectiveLimit = problemLimit x multiplier + startupBudget`, with
`PYTHON = {1x, +1s}` and `JAVA = {2x, +8s}`. The wall-clock kill stays at 3x the *effective*
limit, preserving PRD §7.1's relationship.

**Why additive and not just a bigger multiplier:** runtime startup is a fixed cost with
nothing to do with the student's algorithm. Folding it into a multiplier makes short
problems unjudgeable while handing long ones far too much slack. A pure 3x multiplier was
tried first and produced an *intermittent* TLE on a correct Java submission — worse than a
consistent failure, because a flaky TLE is indistinguishable from a broken judge to the
student holding the keyboard.

---

## D18 — Timeouts are enforced inside the container, and detected by three exit codes (Phase 2)

**Two bugs, one root cause.** The first implementation timed `docker run` from the host.
Container startup on this platform costs 2.4–15.6 s and varies run to run, so that startup
was charged to the submission and **every fixture failed as TLE**, including correct ones.

**Chosen:**
1. The wall-clock kill runs as coreutils `timeout` *inside* the container, where it measures
   the program. Both pinned images ship it.
2. Execution time is read from the daemon's own `State.StartedAt`/`FinishedAt`, which
   bracket the main process and exclude image setup.
3. The host timer survives only as a backstop at the limit plus a 90 s startup allowance.

**And the exit-code subtlety:** `timeout` returns 124 only when it had to kill the command
itself. A process that *handles* SIGTERM and exits on its own — which the JVM does, running
shutdown hooks — exits 143, and `timeout` faithfully propagates that instead; one that
ignores SIGTERM and takes the follow-up SIGKILL exits 137. Reading only 124 reported a Java
infinite loop as `RE`, telling the student their program crashed when it actually ran too
long. All three are now treated as a timeout, with 137 and 143 additionally requiring that
the run lasted at least 80% of the limit, since a program could return either deliberately.

---

## D19 — MLE is detected two ways, because the runtimes fail differently (Phase 2)

**Ambiguous:** PRD §7.2 defines `MLE` as "RSS exceeds the memory limit", which describes a
kernel OOM kill. The JVM does not usually get that far.

**Chosen:** `MLE` when the container was OOM-killed (`State.OOMKilled`, read via inspect
before removal) **or** when the runtime reports exhaustion itself — `OutOfMemoryError` from
the JVM, `MemoryError` from Python.

**Why:** the JVM sizes its heap against the cgroup limit and throws `OutOfMemoryError`
rather than being killed, which without the second check reports `RE` and hides a real
memory-limit failure. Both are the same event from the student's point of view.

Detecting `MLE` also races the clock: a memory bomb must be allowed to actually allocate.
Under load, one fixture's allocation lost that race and reported `TLE`. The fixtures now
commit pages as they allocate rather than relying on lazily-zeroed pages, and the MLE cases
carry a longer `timeLimitMs` — the memory cap is what they are testing, not the clock.

---

## D20 — Containers are not created with `--rm` (Phase 2)

**Chosen:** run without `--rm`, `docker inspect` for `OOMKilled`, `StartedAt` and
`FinishedAt`, then remove explicitly in a `finally`, with `sweepJudgeContainers()` as a
backstop on worker start and after every fixture run.

**Why:** `--rm` deletes the container before it can be inspected, and inspection is the only
reliable way to tell a memory kill from a timeout — both surface as exit 137 — or to measure
execution honestly. The cost is that a crash between run and remove leaks a container, which
is exactly what the prefix-based sweep and G5's `docker ps -a` baseline check exist to catch.

---

## D21 — A Python syntax error is `CE`, not `RE` (Phase 2)

**Ambiguous:** Python has no build step, so a syntax error would naturally surface at run
time as `RE`.

**Chosen:** a compile *phase* for Python that parses without executing:
`python -c "compile(open('/work/main.py').read(), 'main.py', 'exec')"`.

**Why:** `RE` tells a student their algorithm crashed. `CE` tells them the file never
parsed. Those need different fixes, and PRD §7.2 promises compiler output verbatim for `CE`.
`py_compile` was rejected because it writes `__pycache__` next to the source, which is a
read-only mount.

---

## D22 — A stdout flood is `WA` (Phase 2)

**Ambiguous:** PRD's seven verdicts have no "output limit exceeded", but §7.4 requires a
1 GB stdout flood to degrade to a clean verdict.

**Chosen:** capture is capped at 1 MiB; exceeding it kills the container and yields `WA`.

**Why:** the submission produced invalid output, which is a wrong answer. `RE` would imply
the program crashed on its own. The cap is what stops a firehose from OOM-killing the worker
that is supposed to be judging it.

---

## D23 — Scratch lives under the repo, not `os.tmpdir()` (Phase 2)

**Chosen:** per-submission working directories are created under `.judge-tmp/` in the
project, not the system temp directory.

**Why:** on macOS `os.tmpdir()` is `/var/folders/…`, which Docker Desktop does not share by
default. Bind-mounting it silently yields an *empty* directory inside the container, so every
submission fails with "file not found" and the judge looks broken rather than misconfigured.
The project directory is under `/Users`, which is shared out of the box.

---

## D24 — `javac -proc:none` (Phase 2)

**Chosen:** Java compilation disables annotation processing.

**Why:** a submission can ship an annotation processor and execute arbitrary code **at
compile time**, inside the compile container, before any of the run-step reasoning applies.
The compile step is a code-execution surface, not just a translation step. It runs under the
same isolation flags for the same reason.
