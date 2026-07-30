# AUTH — what is implemented, and the two decisions still open

An audit, not a proposal. Nothing in this document has been changed in the code; §4 and §5
record decisions that are the organizers' to make.

---

## 1. What exists today

**No auth library.** There is no NextAuth, Lucia, Passport, Clerk, Auth0, or `jose`.
`package.json` contains no authentication dependency of any kind. The implementation is ~166
hand-written lines in `lib/contest/session.ts`.

That is deliberate rather than an omission. PRD §10 requires the platform to work on a LAN with
no internet and forbids runtime third-party calls on any critical path, which rules out every
hosted identity service. What remains is either a self-hosted library or a small amount of our
own code, and a signed cookie is genuinely small.

**Strategy: stateless signed cookie.**

| Property | Value |
|---|---|
| Signature | HMAC-SHA256 over the JSON claims, `base64url` |
| Verification | `crypto.timingSafeEqual`, with a length check first so a malformed cookie is a 401 rather than a 500 |
| Claims | `sid`, `role` (`COMPETITOR` \| `ADMIN`), `participantId`, `contestId`, `displayName`, `issuedAtMs` |
| Lifetime | 12 hours — a contest night with slack, without leaving a cookie alive for days |
| Clock skew | a token stamped more than a small tolerance in the future is rejected |
| Secret | `SESSION_SECRET`, min 32 chars, from the environment; never in source |

**Cookie flags** (`sessionCookieOptions`): `httpOnly: true`, `sameSite: "lax"`, `path: "/"`,
`maxAge` 12 h, and **`secure: false`**.

`secure: false` is intentional and is the one flag worth arguing about. The night runs on a
classroom LAN over plain HTTP; a `Secure` cookie would never be stored and the entire room would
be unable to log in. `SameSite=Lax` is what covers CSRF, since a cross-site POST sends no
cookie. **If the deployment ever gains TLS, this must flip** — it is flagged for the
`security-auditor` at G11 and noted in `SECURITY.md`.

**Where sessions are stored: nowhere.** There is no `Session` model in `prisma/schema.prisma`.
The cookie *is* the session and the server keeps no record of it. See §4 — this does not match
the stated requirement that sessions live in our own Postgres.

---

## 2. What `POST /api/join` actually does

```
rate-limit by client key
  → validate body against JoinRequestSchema
  → look up Contest by joinCode          (Contest.joinCode is @unique)
  → assert the contest state allows joining
  → validate divisionId belongs to this contest
  → reject a duplicate displayName in this contest  → 409
  → create Participant
  → write AuditLog (participantJoin)
  → mint the session cookie, return JoinResponse
```

There is no password and no email. **Identity is a display name plus possession of the join
code**, which is written on the board at the front of the room. That is appropriate for the
threat model — the adversary is a bored teenager in the same room, not the internet — and it is
what PRD §4 specifies as the mandatory fallback path.

Two decisions inside that flow worth knowing:

- **A duplicate display name is a 409, not a "welcome back."** Treating it as a rejoin would let
  anyone take over another student's participant record by guessing their name. The cost is that
  a student who loses their cookie must pick a new name.
- **A wrong join code and a non-existent contest return the identical error.** No enumeration of
  which codes exist.

**Admin** authenticates with a shared `ADMIN_PASSCODE` from the environment, constant-time
compared, and receives a cookie with `role: ADMIN`. One shared secret for all organizers: there
is no per-organizer identity today.

---

## 3. Google sign-in: absent, and it cannot be the contest-night path

**Status: not implemented and not scaffolded.** Every occurrence of "Google" in the codebase is
either a comment referencing PRD §4 or the removed webfont import. There is no client ID, no
redirect handler, no token exchange, and no `hd=` domain restriction.

**It cannot work on the night, and that is a property of the protocol rather than a library
choice.** OAuth requires the browser to reach `accounts.google.com` for consent, the server to
reach `oauth2.googleapis.com` to exchange the code, and the server to fetch Google's JWKS to
verify the `id_token`. With no internet in the room, none of those complete. Nothing self-hosted
substitutes for them, because the round trip to Google *is* the mechanism.

PRD §4 already says as much: Google sign-in is *preferred*, and a join-code fallback **must**
exist "so the platform works even if Google Workspace access is not available on the night."

There is a second, less obvious trap. Sessions last 12 hours. A student who signs in with Google
at home the night before arrives with an expired cookie and needs to re-authenticate in a room
with no internet. So Google identity cannot be the only way to establish who someone is.

**If Google sign-in is wanted, the shape that works:**

1. It is a **pre-night convenience**, not a contest-night dependency — roster building, practice
   sessions from home, and giving each organizer a real identity instead of one shared passcode.
2. A successful Google sign-in maps onto a `User` row (`User.email` already exists and is
   `@unique`), which a `Participant` may reference. It never becomes the only route to a
   participant record.
3. Restricted to the school domain via the `hd` parameter **and** re-checked server-side on the
   `id_token` — `hd` in the authorization request is a hint, not enforcement.
4. Join-by-code stays wired and tested, and G7 keeps exercising it, so the night's path is the
   one under test.
5. The library would be self-hosted (`arctic` or a hand-rolled OAuth code exchange — roughly 100
   lines), never a hosted service.

Estimated cost: one migration if `User` needs any new column, one route pair
(`/api/auth/google/start` and `/callback`), a JWKS fetch with a cached key set, and an E2E spec
that must be able to run offline — which means the OAuth path needs a stub for G7.

---

## 4. Open decision: should sessions move into Postgres?

The stated requirement is self-hosted with sessions in our own Postgres. **Half of that is
already true** — it is entirely self-hosted, with no third-party call anywhere in the auth path.
The sessions themselves are not in the database.

| | Stateless signed cookie (today) | Postgres-backed session |
|---|---|---|
| Storage | none | one `Session` row per login |
| Per-request cost | HMAC verify, microseconds | **one indexed lookup on every request**, including every SSE tick |
| Revocation | **impossible.** A leaked cookie is valid for 12 h and cannot be killed | revoke one session, or all of a participant's |
| Admin visibility | none | can list and boot active sessions |
| If Postgres is down | auth keeps working | nobody can authenticate |
| Work to change | — | ~4–6 files: schema + migration, `session.ts`, `viewer.ts`, both session routes, tests |

**The argument for changing is revocation.** Right now there is no answer to "a student shared
their cookie" or "boot that participant" beyond rotating `SESSION_SECRET`, which logs out the
entire room mid-contest. That is a plausible thing an organizer needs on the night.

**The argument against is the new dependency.** Today a database blip does not log the room out.
It would.

The per-request cost is not a serious objection: one primary-key lookup is negligible beside a
judge that takes seconds, and the connection pool is now bounded at 20 (see `lib/db.ts`) so it
cannot repeat the exhaustion G8 found.

**Not changed pending a decision.**

---

## 5. Summary for the decision-maker

| Question | Answer |
|---|---|
| Library | none — ~166 lines of our own code |
| Strategy | stateless HMAC-SHA256 signed cookie, 12 h |
| Sessions in Postgres? | **no** — the cookie is the session |
| Self-hosted, no internet? | **yes** — no third-party call in the auth path |
| Hosted service anywhere? | **no** — Clerk/Auth0 were never used and are ruled out by PRD §10 |
| `/join` | join code + display name → `Participant` + cookie; no password |
| Admin | one shared `ADMIN_PASSCODE`, constant-time compared |
| Google sign-in | **absent**, and impossible on the night by protocol (§3) |
| Revocation | **impossible today** — the reason to consider §4 |
