# TODO

Genuine gaps, recorded rather than papered over. Per `docs/KICKOFF.md`: anything incomplete
goes here and its gate stays FAIL — no stubbing a function to satisfy a type, no weakening a
test to get green.

Ordered by consequence, not by effort.

---

## T1 — Hints have no content. Students can pay for nothing. **(blocker for the hint feature)**

**Severity: high.** This is a hole in `docs/PRD.md`, not just in the implementation.

The PRD specifies the hint *economy* precisely — §6.1: two CodingBat warmups earn one hint,
each hint deducts 15% of a group problem's base points, and the ledger is tracked by the
platform rather than by an organizer with a clipboard. §9.1 requires the UI to show the
balance and the next hint's cost *before* the student commits.

Nothing in the PRD, the domain model (§5), or `prisma/schema.prisma` says what a hint
**is**. `HintGrant` records `participantId`, `contestProblemId`, `hintIndex`, `grantedAt`
and `costPaidRef` — that a hint was taken and what it cost. There is no field anywhere that
holds hint *text*, and no way for an organizer to author one.

As it stands a student can spend 15% of a problem's points and the platform has nothing to
show them. The competitor UI currently has to say so out loud.

**Proposed fix** (needs an organizer decision on wording, not just code):

```prisma
model Hint {
  id        String  @id @default(cuid())
  problemId String
  ordinal   Int     // 1..3; matches HintGrant.hintIndex
  text      String  // markdown
  problem   Problem @relation(fields: [problemId], references: [id], onDelete: Cascade)
  @@unique([problemId, ordinal])
}
```

plus `hintText` on the hint-purchase response, and authoring UI in the admin problem editor.
Deferred until the Phase 4b merges land, because `prisma/schema.prisma` is orchestrator-only
and three agents were still building against the current schema when this was found.

**Gate impact:** the hint flow cannot be exercised end-to-end, so any G7 spec covering hints
stays FAIL until this is resolved.

---

## T2 — Monaco is mandated but not installed, and its default loader is a CDN

**Severity: high**, because of the second half.

`docs/PRD.md` §10 mandates Monaco, lazy-loaded. The competitor UI currently ships a
hand-written editor that is keyboard-complete (line numbers, Tab-to-indent, block
indent/dedent, auto-indent, Ctrl/Cmd+Enter) but has no syntax highlighting. It is already
lazy-loaded into its own chunk, and `CodeEditorProps` is the seam, so no call site moves when
Monaco lands.

**The part that would break the night:** `@monaco-editor/react` loads its `vs/` assets from
jsDelivr by default. Dropped in as-is, the editor is dead the moment the room has no
internet — which is the one condition guaranteed on contest night. Installing it therefore
means *also* vendoring `vs/` under `public/` and pointing `loader.config({ paths: { vs:
"/monaco/vs" } })` at it, then proving it works with the network off.

Same applies to `katex` fonts and CSS if the Markdown stack (`react-markdown`, `remark-math`,
`rehype-katex`) is adopted; the hand-written parser currently in place emits React elements
only — no HTML string, no `dangerouslySetInnerHTML` — and that property is worth keeping.

---

## T3 — Contract gaps found by the frontend agents

All in `lib/schemas/api.ts` (orchestrator-owned). Being applied as one reconciliation pass
after `backend-api` merges, so a running agent's contract does not move underneath it.

| Gap | Consequence today |
|---|---|
| No `sourceCode` on `SubmissionView` | PRD §9.1 wants "full history with code". Older submissions render "not available". |
| No problem title/slot on `SubmissionView` | History makes a second `listProblems()` call and joins client-side. |
| No contest-metadata shape (name, `startsAt`, state) | The lobby fetches *standings* just to read the clock off `endsAt`. |
| `SSE_EVENTS.contestState` declared with no payload schema | Event name exists, shape does not. |
| No `testCaseCount` on `ProblemDetail` | The verdict panel cannot say "3 of 12" while judging. |
| No exported TS types for `JoinResponse`, `HintBalance`, `RunSamplesResponse`, `VerdictEvent` | Each consumer re-derives with `z.infer`. |
| Route paths not in the contract | Both sides assume a URL set. Freeze a `ROUTES` const so they cannot drift. |

---

## T4 — `npm run lint` lints agent worktrees

**Severity: low, but it makes G2 untrustworthy during fan-out.**

Agent worktrees are checkouts of this repo living inside it at `.claude/worktrees/`, so
linting the main tree also lints every parallel agent's unmerged work. `tsconfig.json`
excludes them; `eslint.config.mjs` does not, because a config-protection hook blocks edits to
it — correctly in general, since weakening lint config to silence real errors is exactly what
that hook exists to prevent.

Workaround in use: `npx eslint app lib components worker scripts prisma --max-warnings 0`.
The condition disappears when worktrees are removed after merge. A permanent fix means
adding `.claude/worktrees/**` to the eslint ignores, which needs a human to allow that edit.

---

## T5 — Java's time budget is sized for a contended host

Not a defect, but it should not be forgotten. `worker/runner.ts` gives Java a 20-second
startup budget because this machine runs an unrelated container stack alongside the judge and
JVM startup measured 913–6737 ms with a long tail. PRD §14's mitigation — a dedicated judge
host — would let that drop to roughly 3 s. One constant, with the measurements in the comment.

Superseded in scope by **T6**: the budget now lives in `lib/judge/runtimes.ts` and there are
five of them, not one.

---

## T6 — Startup budgets are measured, but on the wrong machine *(resolved on this host)*

All five budgets are now **measured under churn** rather than estimated:

| Runtime | Measured under churn | Budget | Headroom |
|---|---|---|---|
| `python312` | 77 – 512 ms | 6000 ms | 11.7× |
| `jdk21` | 423 – 7837 ms | 20000 ms | 2.6× |
| `gcc14` | 18 – 605 ms | 4000 ms | 6.6× |
| `node22` | 314 – 3636 ms | 10000 ms | 2.8× |
| `go123` | 74 – 845 ms | 4000 ms | 4.7× |

`node22` was raised from 6000 ms, where it had only 1.65× headroom — the thinnest of the five and
the same shape of margin that failed Python.

**The measurement understates what the runner sees, and that is deliberate slack, not sloppiness.**
It times the interpreter directly inside an existing container; a real test also pays for
`timeout`, a shell, and bind-mount reads and writes, and bind-mount I/O is expensive on Docker
Desktop specifically. Measuring Python through the full judge path gave 1006–1651 ms where the
direct method gives 77–512 ms. Every budget is therefore sized as a multiple of the measurement,
not fitted to it.

**Still open:** every number is Docker-Desktop-sized and will be far too generous on a real judge
host. Re-measure there — `docs/HOSTING.md` §6 step 3.

---

## T7 — Sessions are not in Postgres, and Google sign-in cannot work on the night

**Severity: awaiting a decision, not a defect.** Full audit in `docs/AUTH.md`.

Two things were asked for that the current implementation does not provide:

1. **"Sessions in our own Postgres."** They are not. Auth is a stateless HMAC-SHA256 signed
   cookie with no server-side session record, so there is no way to revoke one before it
   expires. `docs/AUTH.md` §4 has the cost of moving them into Postgres.
2. **Google sign-in.** Absent, and **impossible during the contest by protocol**: OAuth needs a
   round trip to `accounts.google.com`, and PRD §10 guarantees the room has no internet. It
   could only ever work as a *pre-night* path — link an account beforehand, fall back to the
   join code on the night — which is a different feature from "log in with Google".

Nothing has been changed, per the instruction to report the cost before acting.
