import type { AuthMethod, Role } from "@prisma/client";

import { prisma } from "@/lib/db";

import {
  SESSION_MAX_AGE_MS,
  hashSessionToken,
  newSessionToken,
} from "@/lib/contest/session";

/**
 * The database half of the session layer.
 *
 * Everything that touches Postgres lives here; `lib/contest/session.ts` stays pure so the
 * signature and cookie logic can be tested without a database. The split is the same one used
 * between `lib/scoring/` and the routes: I/O on one side of a line, logic on the other.
 */

export interface NewSessionInput {
  readonly role: Role;
  readonly method: AuthMethod;
  readonly displayName: string;
  readonly participantId?: string | null;
  readonly contestId?: string | null;
  readonly userId?: string | null;
  readonly maxAgeMs?: number;
}

export interface IssuedSession {
  /** Goes in the cookie. Available exactly once — the row stores only its hash. */
  readonly token: string;
  readonly sessionId: string;
  readonly expiresAt: Date;
}

/** Mint a session row and return the token to set as a cookie. */
export async function issueSession(input: NewSessionInput, now: Date): Promise<IssuedSession> {
  const token = newSessionToken();
  const maxAgeMs = input.maxAgeMs ?? SESSION_MAX_AGE_MS;
  const expiresAt = new Date(now.getTime() + maxAgeMs);

  const row = await prisma.session.create({
    data: {
      tokenHash: hashSessionToken(token),
      role: input.role,
      method: input.method,
      displayName: input.displayName,
      participantId: input.participantId ?? null,
      contestId: input.contestId ?? null,
      userId: input.userId ?? null,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
    },
    select: { id: true },
  });

  return { token, sessionId: row.id, expiresAt };
}

export interface LoadedSession {
  readonly id: string;
  readonly role: Role;
  readonly method: AuthMethod;
  readonly participantId: string | null;
  readonly contestId: string | null;
  readonly userId: string | null;
  readonly displayName: string;
}

/**
 * Resolve a cookie token to a live session, or null.
 *
 * Null covers every "not signed in" case — no such token, revoked, expired, or belonging to a
 * disabled account. They are deliberately indistinguishable to the caller: at the call site
 * "your session was revoked" and "you never had one" both mean anonymous, and telling them
 * apart would leak whether a token was ever valid.
 *
 * A revoked session stops working on the NEXT request, which is the point of moving sessions
 * into Postgres — with a signed cookie it would have kept working until it expired.
 */
export async function loadSession(token: string, now: Date): Promise<LoadedSession | null> {
  if (token === "") return null;

  const row = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: {
      id: true,
      role: true,
      method: true,
      participantId: true,
      contestId: true,
      userId: true,
      displayName: true,
      revokedAt: true,
      expiresAt: true,
      user: { select: { disabledAt: true } },
    },
  });

  if (row === null) return null;
  if (row.revokedAt !== null) return null;
  if (row.expiresAt.getTime() <= now.getTime()) return null;
  // Disabling an account must take effect immediately, not when its sessions happen to expire.
  if (row.user !== null && row.user.disabledAt !== null) return null;

  return {
    id: row.id,
    role: row.role,
    method: row.method,
    participantId: row.participantId,
    contestId: row.contestId,
    userId: row.userId,
    displayName: row.displayName,
  };
}

/**
 * Record that a session was used.
 *
 * Deliberately fire-and-forget and deliberately NOT awaited by the request path: it is
 * bookkeeping for an organizer, and a write on every request — including every SSE poll and
 * every projector standings refresh — would add contention to the one database the judge also
 * uses. A failure here must never fail the request the student is making.
 */
export function touchSession(sessionId: string, now: Date): void {
  void prisma.session
    .update({ where: { id: sessionId }, data: { lastSeenAt: now } })
    .catch(() => {
      // Intentionally swallowed: see above. The session is still valid; only lastSeenAt is stale.
    });
}

/** Revoke one session. Idempotent — revoking an already-revoked session is not an error. */
export async function revokeSession(
  sessionId: string,
  reason: string,
  now: Date,
): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: now, revokedReason: reason },
  });
}

/** Revoke by cookie token, for sign-out where the caller holds a token rather than an id. */
export async function revokeSessionByToken(
  token: string,
  reason: string,
  now: Date,
): Promise<void> {
  if (token === "") return;
  await prisma.session.updateMany({
    where: { tokenHash: hashSessionToken(token), revokedAt: null },
    data: { revokedAt: now, revokedReason: reason },
  });
}

/**
 * Revoke every live session for a participant. The mid-contest lever: a student whose session is
 * being misused gets cut off everywhere at once, without waiting for an expiry.
 */
export async function revokeParticipantSessions(
  participantId: string,
  reason: string,
  now: Date,
): Promise<number> {
  const result = await prisma.session.updateMany({
    where: { participantId, revokedAt: null },
    data: { revokedAt: now, revokedReason: reason },
  });
  return result.count;
}

/** Revoke every live session for a user account. */
export async function revokeUserSessions(
  userId: string,
  reason: string,
  now: Date,
): Promise<number> {
  const result = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now, revokedReason: reason },
  });
  return result.count;
}

export interface LiveSessionSummary {
  readonly id: string;
  readonly role: Role;
  readonly method: AuthMethod;
  readonly displayName: string;
  readonly participantId: string | null;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
}

/** Who is signed in right now — impossible to answer before sessions had rows. */
export async function listLiveSessions(now: Date): Promise<LiveSessionSummary[]> {
  return prisma.session.findMany({
    where: { revokedAt: null, expiresAt: { gt: now } },
    select: {
      id: true,
      role: true,
      method: true,
      displayName: true,
      participantId: true,
      createdAt: true,
      lastSeenAt: true,
    },
    orderBy: { lastSeenAt: "desc" },
  });
}

/**
 * Delete sessions that expired a while ago.
 *
 * Not on the request path. A revoked or expired session is already refused by `loadSession`, so
 * this is housekeeping rather than a security boundary — which is why it keeps rows for a grace
 * period instead of deleting on expiry: an organizer asking "was this student signed in an hour
 * ago" should get an answer.
 */
export async function pruneExpiredSessions(now: Date, graceMs = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date(now.getTime() - graceMs) } },
  });
  return result.count;
}
