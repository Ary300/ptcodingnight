import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { cookiesAreSecure } from "@/lib/contest/env";

/**
 * Session tokens.
 *
 * **The cookie is a pointer, not a credential.** It carries an opaque random token; the session
 * itself lives in Postgres (`Session` in `prisma/schema.prisma`). This file holds only the pure
 * parts — minting a token, hashing it, cookie attributes — so authorization stays testable as
 * plain functions. The database half is `lib/contest/session-store.ts`.
 *
 * ## Why this is not a signed claims blob any more
 *
 * It used to be: `base64url(claims).base64url(hmac)`, verified with no server-side lookup. That
 * is a legitimate design and it is faster, but it cannot do two things this contest needs:
 *
 *  1. **Revoke a session mid-contest.** A signed token is valid until it expires, by
 *     construction. There is no way to cut off a session that is being misused while the round
 *     is still running, which is precisely when it matters.
 *  2. **Answer "who is signed in".** Useful for an organizer, and impossible without records.
 *
 * A server-side session costs one indexed primary-key lookup per request against a Postgres on
 * localhost. That is the right trade for a contest platform.
 *
 * ## Why the token is hashed at rest
 *
 * The database stores SHA-256 of the token, never the token. A database dump therefore yields no
 * usable sessions — the same reason passwords are not stored in the clear. Plain SHA-256 rather
 * than a slow KDF is correct here and would not be for a password: the token is 256 bits of
 * `randomBytes`, so there is no dictionary to attack and nothing for a work factor to buy.
 */

export const SESSION_COOKIE = "ptcn_session";

/** A contest night is a few hours; twelve gives slack without leaving a session alive for days. */
export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * 32 bytes = 256 bits of entropy, which is what makes storing only a fast hash safe: guessing a
 * token is infeasible, so there is nothing for a KDF's work factor to protect.
 */
const TOKEN_BYTES = 32;

/** Mint a fresh cookie token. Returned to the caller once and never recoverable from the row. */
export function newSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** What goes in `Session.tokenHash`. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}

/**
 * Constant-time comparison of two token hashes.
 *
 * Lookups go through the unique index on `tokenHash` rather than through this, so it exists for
 * the places that compare a hash they already hold. Length is checked first because
 * `timingSafeEqual` throws on a mismatch, and a thrown error here would turn a malformed cookie
 * into a 500.
 */
export function sessionHashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Parse a `Cookie` request header. Written by hand rather than reached for from `next/headers`
 * so that authorization stays testable as a plain function of a `Request`.
 */
export function parseCookieHeader(header: string | null | undefined): Record<string, string> {
  const jar: Record<string, string> = {};
  if (header === null || header === undefined || header === "") return jar;

  for (const segment of header.split(";")) {
    const trimmed = segment.trim();
    if (trimmed === "") continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim();
    const raw = trimmed.slice(eq + 1).trim();
    jar[name] = safeDecode(raw);
  }
  return jar;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // A cookie with a stray `%` is not a decoding failure worth raising; take it verbatim and
    // let the store's lookup reject it.
    return value;
  }
}

export interface SessionCookieOptions {
  /**
   * Always true. Nothing in the client reads this cookie — the session is resolved server-side
   * from the `Cookie` header — so there is no legitimate `document.cookie` access to preserve,
   * and any XSS that lands should not also hand over a session token.
   */
  readonly httpOnly: true;
  /**
   * `lax`, and **not** `strict`.
   *
   * `lax` already withholds the cookie from cross-site POST/fetch, which is the CSRF-relevant
   * case: every mutation in this application is a POST, PATCH or DELETE issued by our own
   * script. What `strict` would additionally break is a student following a *link* into the
   * contest — from the projector, from a shared problem URL, from a chat message — who would
   * arrive apparently signed out and re-join, which is the T5 re-roll path.
   */
  readonly sameSite: "lax";
  readonly path: "/";
  readonly maxAge: number;
  /**
   * From `COOKIE_SECURE`, defaulting to true, and production refuses to start when it is false.
   *
   * This was hardcoded `false` and justified by a classroom LAN with no certificate. The
   * deployment is now a real domain behind Let's Encrypt, which makes a non-`Secure` session
   * cookie a plain credential leak: the browser attaches it to any `http://` request to the same
   * host, so anything on the network path reads a token and becomes that student — or, with the
   * organizer's session, everyone.
   *
   * It stays configurable for exactly one case: a plain-HTTP `npm run dev`, where a `Secure`
   * cookie is never stored and nobody can sign in at all.
   */
  readonly secure: boolean;
}

/**
 * `secure` is a parameter with an environment-derived default rather than a direct env read, so
 * that these stay plain functions — a test states the value it wants instead of mutating
 * `process.env` and racing every other test in the file.
 */
export function sessionCookieOptions(
  maxAgeMs: number = SESSION_MAX_AGE_MS,
  secure: boolean = cookiesAreSecure(),
): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
    secure,
  };
}

/**
 * Attributes for clearing the cookie on sign-out.
 *
 * The attributes must match the ones it was set with — a browser treats `Secure` and `Path` as
 * part of the cookie's identity, so clearing with a different `secure` leaves the original in
 * place and sign-out silently does nothing.
 */
export function clearedSessionCookieOptions(
  secure: boolean = cookiesAreSecure(),
): SessionCookieOptions & { maxAge: 0 } {
  return { ...sessionCookieOptions(SESSION_MAX_AGE_MS, secure), maxAge: 0 };
}
