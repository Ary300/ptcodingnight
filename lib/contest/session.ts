import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { z } from "zod";

/**
 * Session cookies.
 *
 * The whole authorization story rests on this file, so it is deliberately small and pure:
 * claims in, signed string out, and nothing that touches a database or a clock it was not
 * handed. Everything here is unit-tested, because the alternative to a tested signature check
 * is a spectator who reads a `participantId` off the projector leaderboard, pastes it into a
 * cookie, and reads somebody else's submissions (docs/PRD.md §4).
 *
 * Format: `base64url(claimsJson).base64url(hmacSha256)`. The MAC covers the encoded payload
 * verbatim, so key order and whitespace inside the JSON cannot change the signature.
 */

export const SESSION_COOKIE = "ptcn_session";

/** A contest night is a few hours; twelve gives slack without leaving a cookie alive for days. */
export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * Tolerance for a cookie stamped slightly in the future. A token minted more than this ahead
 * of now is refused rather than trusted: a far-future `issuedAtMs` is how an attacker would
 * try to mint a session that never expires.
 */
const CLOCK_SKEW_MS = 60_000;

export const SessionRoleSchema = z.enum(["COMPETITOR", "ADMIN"]);
export type SessionRole = z.infer<typeof SessionRoleSchema>;

export const SessionClaimsSchema = z.object({
  /** Random per-session id. Gives the audit log something to name that is not a secret. */
  sid: z.string().min(1),
  role: SessionRoleSchema,
  /** Null for an admin session: organizers are not participants. */
  participantId: z.string().min(1).nullable(),
  contestId: z.string().min(1).nullable(),
  displayName: z.string().min(1).max(64),
  issuedAtMs: z.number().int().nonnegative(),
});
export type SessionClaims = z.infer<typeof SessionClaimsSchema>;

export function newSessionId(): string {
  return randomUUID();
}

function macFor(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signSession(claims: SessionClaims, secret: string): string {
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `${payload}.${macFor(payload, secret)}`;
}

export interface VerifyOptions {
  readonly now?: Date;
  readonly maxAgeMs?: number;
}

/**
 * Verify and decode a session token. Returns null for anything that is not a currently valid,
 * correctly signed session — a bad MAC, a mangled payload, unknown claims, or an expired one.
 *
 * Null rather than a thrown error on purpose: at the call site "no valid session" and "no
 * cookie at all" are the same situation, and both mean anonymous.
 */
export function verifySession(
  token: string,
  secret: string,
  options?: VerifyOptions,
): SessionClaims | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payload, mac] = parts;
  if (payload === undefined || mac === undefined || payload === "" || mac === "") return null;

  const expected = Buffer.from(macFor(payload, secret), "utf8");
  const provided = Buffer.from(mac, "utf8");
  // Length check first: timingSafeEqual throws on a length mismatch, and a thrown error here
  // would turn a malformed cookie into a 500.
  if (expected.length !== provided.length) return null;
  if (!timingSafeEqual(expected, provided)) return null;

  const decoded = decodePayload(payload);
  if (decoded === null) return null;

  const parsed = SessionClaimsSchema.safeParse(decoded);
  if (!parsed.success) return null;

  const now = options?.now?.getTime() ?? Date.now();
  const maxAgeMs = options?.maxAgeMs ?? SESSION_MAX_AGE_MS;
  const age = now - parsed.data.issuedAtMs;
  if (age > maxAgeMs) return null;
  if (age < -CLOCK_SKEW_MS) return null;

  return parsed.data;
}

/** A payload that is not base64url-encoded JSON is a malformed cookie, not an error worth raising. */
function decodePayload(payload: string): unknown {
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
  } catch {
    return null;
  }
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
    // let signature verification reject it.
    return value;
  }
}

export interface SessionCookieOptions {
  readonly httpOnly: true;
  readonly sameSite: "lax";
  readonly path: "/";
  readonly maxAge: number;
  /**
   * Deliberately false.
   *
   * The night runs on a classroom LAN over plain HTTP with no certificate (docs/PRD.md §10).
   * A `Secure` cookie would simply never be stored, and every student would be logged out on
   * the one night it matters. **Flagged for the security review:** if the deployment ever
   * gains TLS, this must become true.
   */
  readonly secure: false;
}

export function sessionCookieOptions(maxAgeMs: number = SESSION_MAX_AGE_MS): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
    secure: false,
  };
}
