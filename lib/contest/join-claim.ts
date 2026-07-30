import { createHmac, timingSafeEqual } from "node:crypto";

import { cookiesAreSecure } from "@/lib/contest/env";

/**
 * The join claim — "this browser has already joined, and it is this participant".
 *
 * ## What it is for
 *
 * `joinContest` used to `create` a `Participant` on every call, and nothing bound a join to a
 * browser. Under `RANDOM_ASSIGNED` a fresh participant draws a fresh set, so:
 *
 *   join as "x1" -> set A, read it. join as "x2" -> set B, read it. join as "x3" -> set C.
 *
 * A handful of joins reads the whole room's Round 1 before it starts. The organizer's format is
 * that sets are assigned and **never previewed** (PRD §6.2), so this does not merely bend the
 * rules — it removes the property the parallel sets exist to provide. The join-failure limiter is
 * no help, because every one of those joins *succeeds*.
 *
 * ## Why a second cookie rather than the session
 *
 * The session cookie is the obvious candidate and it is not enough on its own, in both directions:
 *
 *  - **It is cleared by sign-out.** Sign out, join again as a new name, get a new set. The control
 *    would be one click deep.
 *  - **It expires, and browsers drop cookies.** A student whose session is gone must be able to get
 *    back to *their own* participant. Today they cannot: the display name is `@@unique` per contest,
 *    so retyping their own name returns `CONFLICT` and they are locked out of their own submissions
 *    on the night. This claim is what lets that rejoin be recognised instead of refused.
 *
 * So the claim outlives the session deliberately, and sign-out does not clear it. Signing out means
 * "stop being authenticated", not "pretend I never joined".
 *
 * ## Why it is signed
 *
 * Without a signature the cookie is an unauthenticated participant id, and a student who learns
 * another's id — it appears in their own API responses — could paste it in and be handed that
 * student's participant, their submissions and their score. The HMAC makes the claim
 * unforgeable without `SESSION_SECRET`; `HttpOnly` keeps script from reading it in the first
 * place.
 *
 * ## What this does NOT do
 *
 * Clearing cookies, or a private window, still produces a second participant. This raises the cost
 * of sampling sets from "post the form again" to "clear site data between every attempt, and
 * appear in the organizer's roster as x1, x2, x3 with an audit row each". It is not a proof of
 * identity, and the complete fix is an organizer-issued roster — see `docs/TODO.md` T5.
 */

export const JOIN_CLAIM_COOKIE = "ptcn_join";

/**
 * Longer than a session on purpose (`SESSION_MAX_AGE_MS` is 12 hours).
 *
 * The session answers "are you authenticated right now"; the claim answers "which participant is
 * this browser". The second outlives the first, or the dropped-cookie rejoin it exists to permit
 * would stop working exactly when a student needed it.
 */
export const JOIN_CLAIM_MAX_AGE_MS = 36 * 60 * 60 * 1000;

/** Separates the id from its signature. Not valid in a cuid, so it cannot appear in the payload. */
const SEPARATOR = ".";

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

/**
 * Mint a claim cookie value for a participant.
 *
 * The contest id is signed in alongside the participant id so a claim cannot be replayed into a
 * different contest — participant ids are unique, but binding the pair means a stale claim from
 * last term's contest is rejected as a mismatch rather than looked up and missed.
 */
export function mintJoinClaim(
  participantId: string,
  contestId: string,
  secret: string,
): string {
  const payload = `${participantId}${SEPARATOR}${contestId}`;
  return `${payload}${SEPARATOR}${sign(payload, secret)}`;
}

export interface JoinClaim {
  readonly participantId: string;
  readonly contestId: string;
}

/**
 * Verify a claim cookie, or null.
 *
 * Null for every failure — absent, malformed, wrong signature — because the caller's response to
 * all of them is identical: treat this as a browser that has not joined. Distinguishing them would
 * tell an attacker which part of a forgery attempt was wrong.
 */
export function readJoinClaim(raw: string | undefined, secret: string): JoinClaim | null {
  if (raw === undefined || raw === "") return null;

  const parts = raw.split(SEPARATOR);
  if (parts.length !== 3) return null;

  const [participantId, contestId, signature] = parts;
  if (
    participantId === undefined ||
    contestId === undefined ||
    signature === undefined ||
    participantId === "" ||
    contestId === ""
  ) {
    return null;
  }

  const expected = sign(`${participantId}${SEPARATOR}${contestId}`, secret);

  // Length first: `timingSafeEqual` throws on a mismatch, and a thrown error here would turn a
  // malformed cookie into a 500 instead of an anonymous request.
  const given = Buffer.from(signature, "utf8");
  const want = Buffer.from(expected, "utf8");
  if (given.length !== want.length) return null;
  if (!timingSafeEqual(given, want)) return null;

  return { participantId, contestId };
}

export interface JoinClaimCookieOptions {
  readonly httpOnly: true;
  readonly sameSite: "lax";
  readonly path: "/";
  readonly maxAge: number;
  readonly secure: boolean;
}

export function joinClaimCookieOptions(
  secure: boolean = cookiesAreSecure(),
): JoinClaimCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(JOIN_CLAIM_MAX_AGE_MS / 1000),
    secure,
  };
}
