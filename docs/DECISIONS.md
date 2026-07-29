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
