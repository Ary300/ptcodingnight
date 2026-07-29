# PLAN — Park Tudor Coding Night build

Execution plan for the autonomous build described in `docs/KICKOFF.md`, against the spec in
`docs/PRD.md`. Written at the end of Phase 0.

**Status:** Phases 0, 1 and 3 complete. Phase 2 (judge) blocked on Docker image pulls.

---

## 1. Where the repo actually stands

Skeleton, contracts, and the scoring engine are in. The judge is not.

| Gate | State |
|---|---|
| G0 build, G1 typecheck, G2 lint, G3 unit | **PASS** |
| G6 scoring golden | **PASS** — byte-identical, replay stable, order-independent |
| G4, G5, G8, G10 | **NOT RUN** — blocked on Docker image pulls |
| G7, G9 | not built yet (Phases 4b, 5) |

Toolchain: Node v22.20.0, npm 10.9.3, Docker 29.1.2, Compose v2.40.3.

**Docker is half-available.** The daemon answers — `docker ps` exits 0 and `docker ps -a`
baseline is 0 containers — but **image pulls hang indefinitely** through Docker Desktop's
internal proxy (`http.docker.internal:3128`). No container has ever run. Full diagnosis in
`docs/DECISIONS.md` D1.

> **Phase 2 precondition:** verify `docker ps` at the start of the phase and **hard-fail** if
> the daemon is down. Never build or "test" the judge against an absent daemon — the failure
> mode is a suite that appears to pass because it never ran. A daemon that answers but cannot
> pull is equally disqualifying: confirm `docker pull` completes before trusting G4/G5.

---

## 2. Phase breakdown

| Phase | Deliverable | Exit gate | Parallel? |
|---|---|---|---|
| **0** | This plan, reconciled `CLAUDE.md`, 7 agent definitions, `DECISIONS.md` | Human review | no |
| **1** | Next.js + TS strict skeleton, full Prisma schema (PRD §5) + migration, every shared type and Zod schema, judge job contract, stub scripts for G0–G9, docker-compose | G0 build, G1 types, G2 lint | **no — sequential** |
| **2** | Judge worker, container isolation, verdict aggregation, comparators; `fixtures/judge/` (≥24), `fixtures/sandbox/` (7 hostile) | G4 24/24, G5 7/7 + `docker ps -a` at baseline | no |
| **3** | `lib/scoring/` pure functions, both presets, golden fixture from PRD Appendix A | G6 byte-identical, replay-stable — **PASS** | no |
| **4a** | `docs/DESIGN.md` **token system** — written before any frontend agent starts | tokens exist and are reviewed | no |
| **4b** | API routes, competitor UI, admin UI, projector; problem content for the 20 `solved-in-past` | G0–G3 after each merge; G7 | **yes — max 4** |
| **5** | Projector signature moment, rank-change + unfreeze motion, polish pass | G9 a11y | partial |
| **6** | `scripts/verify.sh`, security review, code review, `README.md` | **G0–G12 all PASS** | no |

Phase 1 is deliberately sequential. Parallel agents sharing undefined interfaces produce
garbage; the contracts must be frozen before anyone fans out.

### Approved deviation — design tokens move to Phase 4a

KICKOFF orders Phase 4 (build the frontend) before Phase 5 (design pass), which builds the
UI twice: agents ship default-Tailwind components, then Phase 5 rewrites them. **Approved:**
the token system — 4–6 named hex values, display/body/monospace faces, a stated type scale,
and the layout concept — is written into `docs/DESIGN.md` as **Phase 4a, before any frontend
agent starts**, so all three build against real tokens from their first commit.

Phase 5 keeps what a design pass should own: the projector leaderboard signature moment,
meaningful rank-change animation, the unfreeze reveal, and polish. No gate is skipped or
reordered — G9 still runs in Phase 5. See `docs/DECISIONS.md` D7.

---

## 3. File-ownership partition

**No path has two owners.** An agent that needs a change outside its paths requests it from
the orchestrator; it does not reach across.

| Path | Sole owner |
|---|---|
| `prisma/**`, `lib/types/**`, `lib/schemas/**` | **orchestrator only** |
| `package.json`, lockfiles, `tsconfig.json`, `next.config.*`, `eslint.*`, `docker-compose.yml`, `.env.example` | **orchestrator only** |
| `docs/**`, `CLAUDE.md`, `.claude/**` | **orchestrator only** |
| `worker/**`, `lib/judge/**`, `fixtures/judge/**`, `fixtures/sandbox/**` | `judge-sandbox` |
| `lib/scoring/**`, `fixtures/scoring/**`, `fixtures/expected-standings.json` | `scoring-engine` |
| `app/api/**`, `lib/contest/**` | `backend-api` |
| `app/(competitor)/**`, `components/contest/**` | `frontend-ui` ⟨contest⟩ |
| `app/(admin)/**`, `components/admin/**` | `frontend-ui` ⟨admin⟩ |
| `app/projector/**`, `components/leaderboard/**` | `frontend-ui` ⟨projector⟩ |
| `components/ui/**` (shared primitives) | **orchestrator only** — frozen before frontend fan-out |
| `content/problems/**`, `data/**` | `problem-content` |
| `tests/**`, `fixtures/**` (all not claimed above), `playwright.config.ts`, `scripts/verify.sh` | `test-infra` |
| — nothing; read-only — | `security-auditor` |

Two carve-outs worth stating explicitly, because they are the collisions this table exists
to prevent:

- **`fixtures/`** is split three ways by subdirectory. `judge-sandbox` owns `judge/` and
  `sandbox/` because it authors them in Phase 2; `scoring-engine` owns `scoring/` and the
  golden standings; `test-infra` owns everything else. Nobody writes into another's subtree.
- **`components/ui/`** is orchestrator-owned precisely because all three frontend instances
  want it. Shared primitives land there before fan-out and are frozen during it.

### `frontend-ui` is one definition, three instances

KICKOFF's agent table defines a single `frontend-ui` agent owning all of `app/(competitor)`,
`app/(admin)`, `app/projector`, and `components/**`, while Phase 4's suggested split names
three separate frontend agents. These reconcile as: **one agent definition, instantiated
three times with disjoint scopes.** Each instance is handed its own path set from the table
above and may not write outside it. That satisfies both — one persona to maintain, and no
two concurrent agents sharing a directory.

---

## 4. Merge order (Phase 4)

Worktree-isolated branches, merged in this order, **G0–G3 re-run with output shown after
each merge**:

```
1. backend-api        → everything else consumes its route contracts
2. frontend-contest   → the critical path in G7 (join → submit → verdict)
3. projector          → read-only consumer of standings; low conflict surface
4. frontend-admin     → largest surface, merged last so it rebases onto a settled tree
5. problem-content    → additive only (content/**, data/**); no source conflicts
```

`problem-content` and `test-infra` run alongside the four implementation agents without
counting against the max-4 cap, because they touch no application source.

## 5. Parallelism rules

- Max **4** implementation agents concurrent (KICKOFF §Phase 4).
- Each agent: isolated git worktree, own branch, stated done condition, own test command.
- Each reports changed files + test output. No agent reports a gate as passing.
- Any agent blocked by a path it does not own **stops and reports** rather than reaching in.
- Three turns stuck on one failure → write it to `DECISIONS.md`, run `/deep-research`.

## 6. Gate ownership

| Gate | Owner | Blocked by |
|---|---|---|
| G0 build, G1 types, G2 lint | orchestrator | — |
| G3 unit (≥90% on scoring + judge) | `test-infra` | — |
| G4 judge fixtures | `judge-sandbox` | **Docker daemon** |
| G5 sandbox | `judge-sandbox` | **Docker daemon** |
| G6 scoring golden | `scoring-engine` | — |
| G7 e2e | `test-infra` | full stack |
| G8 load | `test-infra` | **Docker daemon** |
| G9 a11y | `test-infra` | frontend |
| G10 cold start | orchestrator | **Docker daemon** |
| G11 security | `security-auditor` → orchestrator fixes | full diff |
| G12 clean tree | orchestrator | — |

## 7. Known risks

1. **Docker image pulls hang** (D1). The daemon answers but cannot pull, so Phase 2 has
   never run a container. This is the only thing blocking the judge, and G4/G5/G8/G10 stay
   NOT RUN until it clears. Highest-value intervention available.
2. **Seed data needs a language-aware dedup key** (D2, D6). 136 rows → **125 distinct
   `Problem` records**; the key is `(title, language)` for `codingbat` and `title`
   elsewhere. Keying warmups on title alone silently eats `sum67`. `db:seed` must be
   idempotent so G10's cold start is repeatable.
3. **Group round is 3 problems, not 5** (D3). PRD §15/§16 corrected to match the data.
4. **Scoring's partial-credit rule is the subtlest thing in the spec.** "Best score any of
   that participant's submissions achieved" interacts with the 5-minute penalty rule, which
   only applies to problems *eventually* scored above zero — meaning penalty is not knowable
   until the whole log is replayed. The golden fixture must cover a participant who fails a
   problem repeatedly and never scores it (penalty: zero) alongside one who fails then
   scores (penalty: applied).
5. **The `/goal` evaluator cannot read files.** Every gate claim needs pasted output and a
   `=== GATE STATUS ===` block. Budget transcript space for it.

---

## 8. Immediate next step

Phase 1, on approval: scaffold Next.js + TypeScript strict, author the full Prisma schema
from PRD §5, define every shared type and Zod schema, freeze the judge job contract, wire
stub scripts for G0–G9, and land G0/G1/G2 green with output shown.
