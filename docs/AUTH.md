# AUTH — who can sign in, and how

Current as of the team-scoring rewrite. **Supersedes the earlier version of this document**, which
described a stateless signed-cookie design and justified the absence of OAuth on the grounds that the
contest room had no internet. Both of those have changed — §6 records what and why.

---

## 1. Summary

| | |
|---|---|
| **Library** | None. Hand-rolled, ~450 lines across four files. No NextAuth, Lucia, Passport, Clerk, or Auth0. |
| **Session strategy** | **Database sessions.** Opaque random token in a cookie, `Session` row in Postgres. Not JWT. |
| **Where sessions live** | The `Session` table. They survive a web or worker restart. |
| **Revocable mid-contest** | **Yes** — that is the reason for the design. Effective on the next request. |
| **Providers** | Email/password (scrypt), Google OAuth, GitHub OAuth, plus admin-issued join codes. |
| **Can OAuth create an account** | **No.** Enforced by the schema, not by a check. See §3. |

Files: `lib/contest/session.ts` (pure token and cookie logic), `session-store.ts` (the database
half), `password.ts` (scrypt), `oauth.ts` (provider flows), `accounts.ts` (resolution and the
invariant).

---

## 2. The four ways in

### 2.1 Join code — the competitor path

`POST /api/join` with a contest join code and a display name. Creates a `Participant`; no `User`,
no credential. This is what a student uses on the night, because the code is on the board at the
front of the room.

Kept as the primary competitor path deliberately: no third-party dependency, no consent screen,
nothing to forget.

### 2.2 Email and password — the organizer path

scrypt, cost `N=32768, r=8, p=1`, in the self-describing format `scrypt$N$r$p$salt$hash` so cost
parameters can be raised later without invalidating hashes already stored.

scrypt rather than bcrypt or argon2 because it is in Node's standard library. A native dependency
that needs a compiler is exactly the kind of thing that stops working after a Node upgrade, and PRD
§3 S6 wants a student maintainer to be able to run this years from now. scrypt is memory-hard, which
is the property that matters.

Two details that are easy to get wrong, both tested:

- **Failures are indistinguishable.** No such email, wrong password, and disabled account all return
  the same message. Distinguishing them turns the login form into an account enumerator.
- **An unknown email still pays for a hash**, against a fixed dummy value, so response time does not
  reveal whether an account exists.

### 2.3 Google · 2.4 GitHub — optional convenience

Standard authorization-code flow. `state` is **mandatory**, stored hashed in a short-lived cookie,
compared in constant time. Without it an attacker can complete an OAuth flow in a victim's browser
and bind their own provider account to the victim's session.

**The account key is the provider's stable subject id** — Google's `sub`, GitHub's numeric `id`.
Never an email, never a GitHub `login`: emails get reassigned between people, and GitHub usernames
are renameable and reusable, so keying on either eventually hands one person's account to another.

**Only a verified email may match an existing account.** An unverified email is a claim by whoever is
signing in rather than by the provider, so matching on it would let anyone who can set their profile
email to an organizer's address take that organizer's account.

Google sends `email_verified` as the string `"true"` in some flows. Reading it as a boolean makes
every email unverified, which silently makes Google sign-in never match anything.

---

## 3. OAuth cannot create an account, and that is a schema fact

`User.passwordHash` is **NOT NULL**. An account reachable only through Google or GitHub is therefore
*unrepresentable* — not discouraged by a code path a future refactor could forget, but rejected by
Postgres.

The OAuth paths look up an existing user by provider subject, or by verified email on first use, and
link. **There is no branch that inserts a `User`.** Accounts are admin-issued.

**Why keep this now that internet is guaranteed?** Because OAuth fails for reasons that have nothing
to do with the venue:

- an expired or rotated client secret
- a changed consent screen, or an OAuth app pending verification
- a student without a school Google account
- the provider having an afternoon

A contest that cannot start because Google is unavailable is a contest that cannot start. Every
account keeps a way in that depends on nothing outside this box.

One further refusal worth naming: if an email resolves to a *different* provider subject than the one
already stored, sign-in is refused rather than silently re-linked. That means either a reassigned
school address or an account-takeover attempt, and both deserve a human.

---

## 4. Sessions

```
cookie:  ptcn_session = <32 random bytes, base64url>
row:     Session { tokenHash = sha256(token), role, method, participantId?, contestId?,
                   userId?, expiresAt, revokedAt, revokedReason, lastSeenAt }
```

**The cookie is a pointer, not a credential.** The database stores only SHA-256 of the token, never
the token, so a database dump yields no usable sessions — the same reason passwords are not stored in
the clear.

Plain SHA-256 rather than a slow KDF is correct here and would be wrong for a password: the token is
256 bits of `randomBytes`, so there is no dictionary to attack and nothing a work factor would buy.

### 4.1 What this bought

| Capability | Signed cookie | Database session |
|---|---|---|
| Revoke mid-contest | **Impossible** — valid until expiry, by construction | Yes, effective next request |
| Survive a redeploy | Yes | Yes |
| Answer "who is signed in" | **Impossible** — no records exist | Yes (`listLiveSessions`) |
| Cost per request | Zero | One indexed primary-key lookup on localhost |

For a contest platform where an organizer may need to cut off a session while a round is running,
one indexed lookup is the right trade.

### 4.2 Revocation

- `revokeSessionByToken` — sign-out. Sign-out now **revokes the row**, where previously it only
  cleared the cookie and left a token that still authenticated if anyone had captured it.
- `revokeParticipantSessions` — the mid-contest lever. Cuts a student off everywhere at once.
- `revokeUserSessions` — the same for an organizer account.
- Setting `User.disabledAt` invalidates that account's sessions immediately, rather than whenever
  they happen to expire.

Revoked rows are kept rather than deleted, so the audit trail survives the revocation and "why am I
signed out" has an answer. `pruneExpiredSessions` clears them after a grace period.

Every "not signed in" case — no such token, revoked, expired, disabled account — is deliberately
indistinguishable to the caller. Telling them apart would reveal whether a token was ever valid.

### 4.3 `lastSeenAt` is deliberately not awaited

Every authenticated request touches `lastSeenAt`, and that write is fire-and-forget. It is
bookkeeping for an organizer: a failure must never fail a student's submission, and awaiting a write
on every SSE tick and projector refresh would add contention to the database the judge also uses.

---

## 5. The cookie is not `Secure`, on purpose

`secure: false`. The deployment serves plain HTTP on a classroom LAN with no certificate, and a
`Secure` cookie would simply never be stored — every student signed out on the one night it matters.

**Flagged for the security review.** If the deployment ever gains TLS this must become `true`. It is
the one place in this file where the safe-looking option is the one that breaks the event.

`httpOnly: true` and `sameSite: "lax"` are both set: script cannot read the cookie, and following a
link into the contest still works.

---

## 6. What changed, and what survived the reasoning changing

| Then | Now | Why |
|---|---|---|
| Stateless HMAC-SHA256 signed cookie, no server-side record | `Session` rows in Postgres | Revocation mid-contest was impossible by construction |
| Sign-out cleared the cookie | Sign-out revokes the row | Clearing a cookie leaves a working token behind |
| Google sign-in impossible **by protocol** — the room had no internet | Google and GitHub both implemented | PRD §10.1: internet at the event is now guaranteed |
| Join code justified by "OAuth needs the network" | Join code justified by "OAuth fails for its own reasons" | The conclusion survived the premise changing — but not for the original reason, and that is worth being explicit about |
| One credential path (shared passcode) | Four | — |
| `SESSION_SECRET` signed every cookie | No longer used for sessions | There is no signature to verify; the token is looked up |

The shared organizer passcode (`ADMIN_PASSCODE`) still exists and still works, and now issues a
session with `method: ADMIN_PASSCODE`. It is the operational fallback for the night.

`AuthMethod` is recorded per session, so "who was signed in, and how" is answerable after the fact
and the "OAuth is never the only way in" rule is auditable rather than merely intended.

---

## 7. Known gaps

Real, and tracked in `docs/TODO.md` rather than papered over here.

- **The provider routes are not wired yet.** `lib/contest/oauth.ts`, `password.ts` and `accounts.ts`
  are complete and unit-tested, but `app/api/auth/**` does not exist — so Google, GitHub and
  email/password are **not reachable over HTTP**. Join code and the admin passcode are.
- **No account-management UI.** Accounts must be admin-issued (§3) and there is no screen for it, so
  in practice they are seeded or created by hand.
- **No password reset flow.** Deliberate for now: a reset needs email delivery, which is another
  runtime dependency, and an organizer can reset another organizer's password directly.
- **No brute-force limiter on the password path.** The passcode and join paths are rate limited; the
  account-enumeration defences in §2.2 are in place, but a per-client limiter on password sign-in is
  not yet wired.
